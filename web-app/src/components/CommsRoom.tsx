import { useEffect, useRef, useState } from "react";
import { ensureAuth, supabase } from "../utils/supabaseClient";
import { compressImageFile } from "../utils/geoAndHash";
import { MarkdownBody } from "../utils/simpleMarkdown";

interface CommsRoomProps {
  handle: string;
  points: number;
}

interface RawMessage {
  id: string;
  nickname: string;
  content: string;
  created_at: string;
}

type PostTag = "DISCUSS" | "GIG / SHOW" | "RELEASE" | "GEAR" | "FOR SALE" | "TIPS";
type RoomMode = "forum" | "chat";

interface ParsedPost extends RawMessage {
  isStructured: boolean;
  tag: PostTag;
  subject: string | null;
  imageUrls: string[];
  authorId: string | null;
  body: string;
}

interface BoardChannel {
  code: string;
  name: string;
  subtitle: string;
  defaultMode: RoomMode;
}

const SECRET_GIG_ROOM = "SUBSOL89";
const OWNED_POSTS_KEY = "frecventa77_owned_post_ids";
const MAX_PHOTOS_PER_POST = 4;

const OFFICIAL_BOARDS: BoardChannel[] = [
  {
    code: "GIGPROMO",
    name: "BAND GIGS, RELEASES & LINEUPS",
    subtitle: "Promote local underground shows, EPs & open slots",
    defaultMode: "forum",
  },
  {
    code: "GEARSWAP",
    name: "GEAR SETUPS & SWAP / SELL",
    subtitle: "Multi-photo rig rundowns, pedals, amps & secondhand gear",
    defaultMode: "forum",
  },
  {
    code: "DIYTECHS",
    name: "SOUND TIPS & DIY TECH",
    subtitle: "Rehearsal rooms, wiring hacks, zine printing & mixing tips",
    defaultMode: "forum",
  },
  {
    code: "FREQ0077",
    name: "GENERAL SCENE BOARD",
    subtitle: "Timișoara rock community discussions & announcements",
    defaultMode: "forum",
  },
];

function parseForumPost(msg: RawMessage): ParsedPost {
  // Format: [TAG:GEAR|SUBJ:My Pedalboard|IMGS:url1,url2]\nMarkdown body...
  // Also backwards-compatible with single |IMG:url
  const match = msg.content.match(
    /^\[TAG:(DISCUSS|GIG \/ SHOW|RELEASE|GEAR|FOR SALE|TIPS)\|SUBJ:([^|\]]*)(?:\|(?:IMGS|IMG):([^|\]]*))?(?:\|UID:([^\]]*))?\]\n([\s\S]*)$/
  );
  if (match) {
    const rawImgs = match[3]?.trim() || "";
    // Support comma-separated URLs while keeping data:image/...;base64,... intact
    const imageUrls = rawImgs
      ? rawImgs
          .split(/,(?=https?:\/\/|data:image\/)/)
          .map((u) => u.trim())
          .filter(Boolean)
      : [];

    return {
      ...msg,
      isStructured: true,
      tag: match[1] as PostTag,
      subject: match[2].trim() || null,
      imageUrls,
      authorId: match[4]?.trim() || null,
      body: match[5],
    };
  }
  return {
    ...msg,
    isStructured: false,
    tag: "DISCUSS",
    subject: null,
    imageUrls: [],
    authorId: null,
    body: msg.content,
  };
}

function generateRoomCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
}

async function uploadPostImage(file: File): Promise<string> {
  await ensureAuth();
  const compressedDataUrl = await compressImageFile(file, 720);
  const res = await fetch(compressedDataUrl);
  const blob = await res.blob();

  const filePath = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.jpg`;
  const { error } = await supabase.storage
    .from("post-images")
    .upload(filePath, blob, { contentType: "image/jpeg", upsert: false });

  if (error) {
    // Compact fallback if storage bucket isn't configured yet
    return await compressImageFile(file, 260);
  }

  const { data } = supabase.storage.from("post-images").getPublicUrl(filePath);
  return data.publicUrl;
}

export default function CommsRoom({ handle, points }: CommsRoomProps) {
  const nickname = (handle || "LISTENER").trim().slice(0, 24);
  const canAccessSecretRoom = points >= 150;

  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);
  const [activeRoomTitle, setActiveRoomTitle] = useState<string>("");
  const [roomMode, setRoomMode] = useState<RoomMode>("forum");
  const [joinInput, setJoinInput] = useState("");
  const [customCodeInput, setCustomCodeInput] = useState("");
  const [lobbyStatus, setLobbyStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [connStatus, setConnStatus] = useState("OFFLINE");
  const [messages, setMessages] = useState<RawMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [filterTag, setFilterTag] = useState<PostTag | "ALL">("ALL");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  // Track IDs of posts created from this device
  const [ownedPostIds, setOwnedPostIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(OWNED_POSTS_KEY);
      return saved ? (JSON.parse(saved) as string[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(OWNED_POSTS_KEY, JSON.stringify(ownedPostIds));
  }, [ownedPostIds]);

  // Forum Post Composer
  const [showComposer, setShowComposer] = useState(false);
  const [previewMarkdown, setPreviewMarkdown] = useState(false);
  const [postTag, setPostTag] = useState<PostTag>("GEAR");
  const [postSubject, setPostSubject] = useState("");
  const [postBody, setPostBody] = useState("");
  const [postPhotoFiles, setPostPhotoFiles] = useState<File[]>([]);
  const [postPhotoPreviews, setPostPhotoPreviews] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Live Chat Quick Input
  const [chatDraft, setChatDraft] = useState("");
  const [sending, setSending] = useState(false);

  const roomIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function enterRoom(
    codeToJoin: string,
    title = "",
    autoCreateIfMissing = false,
    mode: RoomMode = "chat"
  ) {
    const cleanCode = codeToJoin.trim().toUpperCase();
    if (!/^[A-Z0-9]{8}$/.test(cleanCode)) {
      setLobbyStatus("[X] ROOM / BOARD CODE MUST BE 8 ALPHANUMERIC CHARS.");
      return;
    }

    setBusy(true);
    setLobbyStatus(">> TUNING FREQUENCY...");

    try {
      let { data: room, error } = await supabase
        .from("rooms")
        .select("id, room_code")
        .eq("room_code", cleanCode)
        .maybeSingle();

      if (error) throw error;

      if (!room && autoCreateIfMissing) {
        const user = await ensureAuth();
        const inserted = await supabase
          .from("rooms")
          .insert({ room_code: cleanCode, owner_id: user.id })
          .select("id, room_code")
          .single();
        if (inserted.error) throw inserted.error;
        room = inserted.data;
      }

      if (!room) {
        setLobbyStatus(`[X] FREQUENCY ${cleanCode} NOT FOUND.`);
        return;
      }

      roomIdRef.current = room.id;
      setLobbyStatus(null);
      setActiveRoomTitle(title || `LIVE ROOM ${cleanCode}`);
      setRoomMode(mode);
      setFilterTag("ALL");
      setShowComposer(false);
      setPreviewMarkdown(false);
      setActiveRoomCode(cleanCode);
    } catch (err) {
      console.error(err);
      setLobbyStatus("[X] DATABASE CONNECTION ERROR.");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateRoom() {
    const custom = customCodeInput.trim().toUpperCase();
    if (custom && !/^[A-Z0-9]{8}$/.test(custom)) {
      setLobbyStatus("[X] CUSTOM CODE MUST BE EXACTLY 8 LETTERS OR NUMBERS.");
      return;
    }

    setBusy(true);
    setLobbyStatus(">> ALLOCATING LIVE CHATROOM...");

    try {
      const user = await ensureAuth();
      for (let attempt = 0; attempt < 3; attempt++) {
        const code = custom || generateRoomCode();
        const { data, error } = await supabase
          .from("rooms")
          .insert({ room_code: code, owner_id: user.id })
          .select("id, room_code")
          .single();

        if (!error && data) {
          roomIdRef.current = data.id;
          setLobbyStatus(null);
          setActiveRoomTitle(`LIVE ROOM ${data.room_code}`);
          setRoomMode("chat");
          setActiveRoomCode(data.room_code);
          return;
        }
        if (error?.code === "23505" && custom) {
          setLobbyStatus("[X] ROOM CODE ALREADY TAKEN.");
          return;
        }
      }
      setLobbyStatus("[X] COULD NOT ALLOCATE ROOM.");
    } catch (err) {
      console.error(err);
      setLobbyStatus("[X] AUTH / DB ERROR.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!activeRoomCode || !roomIdRef.current) return;

    const currentRoomId = roomIdRef.current;
    const sessionId = sessionIdRef.current;
    let cancelled = false;
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled) setCurrentUserId(data.user?.id ?? null);
    });

    setConnStatus("CONNECTING...");
    setMessages([]);
    setOnlineUsers([]);

    const channel = supabase.channel(`room:${currentRoomId}`, {
      config: { presence: { key: sessionId } },
    });

    channel
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `room_id=eq.${currentRoomId}`,
        },
        (payload) => {
          const incoming = payload.new as RawMessage;
          setMessages((prev) =>
            prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]
          );
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "messages",
        },
        (payload) => {
          const deletedId = (payload.old as { id?: string })?.id;
          if (deletedId) {
            setMessages((prev) => prev.filter((m) => m.id !== deletedId));
          }
        }
      )
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState<{ nickname?: string; session_id?: string }>();
        const users = Object.values(state).flat();

        const duplicate = users.some(
          (u) =>
            u.nickname?.toLowerCase() === nickname.toLowerCase() &&
            u.session_id !== sessionId
        );

        if (duplicate && !cancelled) {
          setLobbyStatus(`[X] HANDLE @${nickname} ALREADY ACTIVE IN ROOM.`);
          setActiveRoomCode(null);
          return;
        }

        const names = users.map((u) => u.nickname || "ANON");
        setOnlineUsers(Array.from(new Set(names)));
      });

    channel.subscribe(async (status) => {
      if (cancelled) return;
      if (status === "SUBSCRIBED") {
        await channel.track({ nickname, session_id: sessionId });
        setConnStatus("LIVE");

        const { data: history } = await supabase
          .from("messages")
          .select("id, nickname, content, created_at")
          .eq("room_id", currentRoomId)
          .order("created_at", { ascending: true })
          .limit(120);

        if (!cancelled && history) {
          setMessages(history);
        }
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setConnStatus("SIGNAL LOST");
      }
    });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [activeRoomCode, nickname]);

  useEffect(() => {
    if (roomMode === "chat") {
      chatBottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, roomMode]);

  function handleSelectPostPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(e.target.files ?? []);
    if (selectedFiles.length === 0) return;

    const remainingSlots = MAX_PHOTOS_PER_POST - postPhotoFiles.length;
    const accepted = selectedFiles.slice(0, remainingSlots);

    setPostPhotoFiles((prev) => [...prev, ...accepted]);
    setPostPhotoPreviews((prev) => [
      ...prev,
      ...accepted.map((f) => URL.createObjectURL(f)),
    ]);
    e.target.value = "";
  }

  function removeDraftPhoto(index: number) {
    setPostPhotoFiles((prev) => prev.filter((_, i) => i !== index));
    setPostPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  function applyMarkdownSnippet(prefix: string, suffix = "", placeholder = "text") {
    const el = textareaRef.current;
    if (!el) {
      setPostBody((prev) => `${prev}${prefix}${placeholder}${suffix}`);
      return;
    }
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = postBody.slice(start, end) || placeholder;
    const next =
      postBody.slice(0, start) + prefix + selected + suffix + postBody.slice(end);
    setPostBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  }

  async function handlePublishForumPost(e: React.FormEvent) {
    e.preventDefault();
    const cleanBody = postBody.trim();
    const cleanSubject = postSubject.trim().replace(/[\]|]/g, "");
    if (!cleanBody || !roomIdRef.current || sending) return;

    setSending(true);
    try {
      const uploadedUrls: string[] = [];
      for (const file of postPhotoFiles) {
        const url = await uploadPostImage(file);
        uploadedUrls.push(url);
      }

      const user = await ensureAuth();
      const uidPart = `|UID:${user.id}`;
      const header =
        uploadedUrls.length > 0
          ? `[TAG:${postTag}|SUBJ:${cleanSubject}|IMGS:${uploadedUrls.join(",")}${uidPart}]`
          : `[TAG:${postTag}|SUBJ:${cleanSubject}${uidPart}]`;

      const encodedContent = `${header}\n${cleanBody}`;

      const { data, error } = await supabase
        .from("messages")
        .insert({
          room_id: roomIdRef.current,
          nickname,
          content: encodedContent.slice(0, 4000),
        })
        .select("id")
        .single();

      if (error) throw error;
      if (data?.id) {
        setOwnedPostIds((prev) => [...prev, data.id]);
      }

      setPostSubject("");
      setPostBody("");
      setPostPhotoFiles([]);
      setPostPhotoPreviews([]);
      setPreviewMarkdown(false);
      setShowComposer(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  async function handleDeletePost(postId: string) {
    if (deletingId) return;
    setDeletingId(postId);
    try {
      await ensureAuth();
      const { error } = await supabase.from("messages").delete().eq("id", postId);
      if (error) throw error;
      setMessages((prev) => prev.filter((m) => m.id !== postId));
      setOwnedPostIds((prev) => prev.filter((id) => id !== postId));
    } catch (err) {
      console.error("Failed to delete post:", err);
      alert("Could not delete post from database. Check DELETE RLS policy on messages.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleSendChatMessage(e: React.FormEvent) {
    e.preventDefault();
    const clean = chatDraft.trim();
    if (!clean || !roomIdRef.current || sending) return;

    setSending(true);
    try {
      const { data, error } = await supabase
        .from("messages")
        .insert({
          room_id: roomIdRef.current,
          nickname,
          content: clean.slice(0, 600),
        })
        .select("id")
        .single();
      if (error) throw error;
      if (data?.id) {
        setOwnedPostIds((prev) => [...prev, data.id]);
      }
      setChatDraft("");
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  // LOBBY VIEW
  if (!activeRoomCode) {
    return (
      <div className="space-y-4 font-mono text-[#EAE6DF]">
        <div className="flex items-center justify-between border-b-2 border-[#EAE6DF] pb-2">
          <h2 className="text-lg font-bold uppercase tracking-widest">// Forum &amp; Live Comms</h2>
          <span className="text-xs text-[#33FF00]">@{nickname}</span>
        </div>

        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase text-[#33FF00]">
            1. SAMIZDAT FORUM BOARDS (MARKDOWN + MULTI-PHOTO):
          </div>

          {OFFICIAL_BOARDS.map((board) => (
            <button
              key={board.code}
              type="button"
              disabled={busy}
              onClick={() => enterRoom(board.code, board.name, true, board.defaultMode)}
              className="flex w-full items-center justify-between border-2 border-[#EAE6DF] bg-[#141414] p-3 text-left hover:border-[#33FF00]"
            >
              <div>
                <div className="text-xs sm:text-sm font-bold uppercase text-[#33FF00]">
                  [{board.code}] {board.name}
                </div>
                <div className="text-[11px] text-[#EAE6DF]/70">{board.subtitle}</div>
              </div>
              <span className="ml-2 whitespace-nowrap text-xs font-bold uppercase">
                &gt;&gt; BOARD
              </span>
            </button>
          ))}
        </div>

        <div className="space-y-2 border-t-2 border-[#EAE6DF]/40 pt-3">
          <div className="text-[11px] font-bold uppercase text-[#D9381E]">
            2. SMALL LIVE CHATROOMS (CONCERTS &amp; BACKSTAGE):
          </div>

          <button
            type="button"
            disabled={busy || !canAccessSecretRoom}
            onClick={() => enterRoom(SECRET_GIG_ROOM, "SUBSOL89 LIVE GIG CHAT", true, "chat")}
            className="flex w-full items-center justify-between border-2 border-[#EAE6DF] bg-[#141414] p-3 text-left disabled:opacity-45"
          >
            <div>
              <div className="text-xs sm:text-sm font-bold uppercase text-[#D9381E]">
                [{canAccessSecretRoom ? SECRET_GIG_ROOM : "LOCKED"}] SECRET GIG LIVE CHAT
              </div>
              <div className="text-[11px] text-[#EAE6DF]/70">
                {canAccessSecretRoom
                  ? "Clearance verified // Real-time gig coordination & door drops"
                  : "Requires 150 PTS (Unlock 1 scan node to reveal live room)"}
              </div>
            </div>
            <span className="ml-2 whitespace-nowrap text-xs font-bold uppercase">
              {canAccessSecretRoom ? ">> CHAT" : "[LOCKED]"}
            </span>
          </button>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void enterRoom(joinInput, "", false, "chat");
            }}
            className="space-y-2 border-2 border-[#EAE6DF] bg-[#141414] p-3"
          >
            <label className="block text-xs font-bold uppercase">
              JOIN SMALL ROOM BY 8-CHAR CODE:
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={8}
                value={joinInput}
                onChange={(e) => setJoinInput(e.target.value.toUpperCase())}
                placeholder="EX: SUBSOL89"
                className="flex-1 rounded-none border-2 border-[#EAE6DF] bg-black p-2 text-sm uppercase text-[#EAE6DF]"
              />
              <button
                type="submit"
                disabled={busy}
                className="rounded-none border-2 border-[#EAE6DF] bg-[#D9381E] px-4 text-xs font-bold uppercase text-[#EAE6DF]"
              >
                JOIN
              </button>
            </div>
          </form>

          <div className="space-y-2 border-2 border-dashed border-[#EAE6DF]/50 bg-[#141414] p-3">
            <div className="text-xs font-bold uppercase">CREATE PRIVATE 8-CHAR CHATROOM:</div>
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={8}
                value={customCodeInput}
                onChange={(e) => setCustomCodeInput(e.target.value.toUpperCase())}
                placeholder="OPTIONAL 8-CHAR CODE"
                className="flex-1 rounded-none border-2 border-[#EAE6DF] bg-black p-2 text-xs uppercase text-[#EAE6DF]"
              />
              <button
                type="button"
                disabled={busy}
                onClick={handleCreateRoom}
                className="rounded-none border-2 border-[#EAE6DF] bg-[#EAE6DF] px-3 text-xs font-bold uppercase text-[#0D0D0D]"
              >
                CREATE ROOM
              </button>
            </div>
          </div>
        </div>

        {lobbyStatus && (
          <p className="border border-[#D9381E] bg-[#141414] p-2 text-xs uppercase text-[#D9381E]">
            {lobbyStatus}
          </p>
        )}
      </div>
    );
  }

  const parsedPosts = messages.map(parseForumPost);
  const forumPosts = [...parsedPosts]
    .reverse()
    .filter((p) => (filterTag === "ALL" ? true : p.tag === filterTag));

  const tagBadgeStyle: Record<PostTag, string> = {
    "GIG / SHOW": "border-[#D9381E] bg-[#D9381E] text-[#EAE6DF]",
    RELEASE: "border-[#33FF00] bg-[#33FF00] text-[#0D0D0D]",
    DISCUSS: "border-[#EAE6DF] text-[#EAE6DF]",
    GEAR: "border-[#33FF00] text-[#33FF00]",
    "FOR SALE": "border-[#D9381E] text-[#D9381E]",
    TIPS: "border-[#EAE6DF]/70 text-[#EAE6DF]/90",
  };

  function isPostAuthor(post: ParsedPost): boolean {
    if (post.authorId && currentUserId) {
      return post.authorId === currentUserId;
    }
    return ownedPostIds.includes(post.id);
  }

  return (
    <div className="flex flex-col space-y-3 font-mono text-[#EAE6DF]">
      {/* Header + Mode Switcher */}
      <div className="flex items-center justify-between gap-2 border-b-2 border-[#EAE6DF] pb-2">
        <div>
          <div className="text-[10px] uppercase text-[#EAE6DF]/60">{activeRoomTitle}</div>
          <div className="flex items-center gap-2">
            <strong className="text-base tracking-widest text-[#33FF00]">{activeRoomCode}</strong>
            <span className="text-[10px] uppercase text-[#EAE6DF]/70">[{connStatus}]</span>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setRoomMode((m) => (m === "forum" ? "chat" : "forum"))}
            className="border border-[#33FF00] px-2 py-1 text-[10px] font-bold uppercase text-[#33FF00]"
          >
            {roomMode === "forum" ? "LIVE CHAT" : "FORUM VIEW"}
          </button>
          <button
            type="button"
            onClick={() => setActiveRoomCode(null)}
            className="border border-[#D9381E] px-2 py-1 text-xs font-bold uppercase text-[#D9381E]"
          >
            &lt;- EXIT
          </button>
        </div>
      </div>

      {/* Online Listeners Strip */}
      <div className="flex flex-wrap items-center gap-1.5 border border-[#EAE6DF]/30 bg-[#141414] px-2.5 py-1.5 text-[11px]">
        <span className="text-[#33FF00]">● {onlineUsers.length} ONLINE:</span>
        {onlineUsers.map((u) => (
          <span key={u} className="bg-black px-1.5 py-0.5 text-[#EAE6DF]">
            @{u}
          </span>
        ))}
      </div>

      {/* MODE A: SMALL LIVE CHATROOM */}
      {roomMode === "chat" ? (
        <>
          <div className="h-[52vh] space-y-2 overflow-y-auto border-2 border-[#EAE6DF] bg-[#141414] p-3 text-xs">
            {parsedPosts.length === 0 ? (
              <p className="italic text-[#EAE6DF]/50">
                &gt;&gt; Frequency open. Say something as @{nickname}...
              </p>
            ) : (
              parsedPosts.map((m) => {
                const isMe = isPostAuthor(m);
                return (
                  <div key={m.id} className="leading-relaxed">
                    <span className="text-[#EAE6DF]/40">
                      [
                      {new Date(m.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                      ]{" "}
                    </span>
                    <span className={isMe ? "font-bold text-[#D9381E]" : "font-bold text-[#33FF00]"}>
                      &lt;{m.nickname}&gt;
                    </span>{" "}
                    {m.subject && <strong className="uppercase">[{m.subject}] </strong>}
                    <span className="break-words">{m.body}</span>
                    {isMe && (
                      <button
                        type="button"
                        onClick={() => handleDeletePost(m.id)}
                        className="ml-2 text-[10px] uppercase text-[#D9381E] underline"
                      >
                        [x]
                      </button>
                    )}
                    {m.imageUrls.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {m.imageUrls.map((url, idx) => (
                          <img
                            key={idx}
                            src={url}
                            alt="attachment"
                            onClick={() => setLightboxUrl(url)}
                            className="max-h-36 cursor-pointer border border-[#EAE6DF]/40 object-contain"
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
            <div ref={chatBottomRef} />
          </div>

          <form onSubmit={handleSendChatMessage} className="flex gap-2">
            <input
              type="text"
              maxLength={500}
              value={chatDraft}
              onChange={(e) => setChatDraft(e.target.value)}
              placeholder={`Message ${activeRoomCode} as @${nickname}...`}
              className="flex-1 rounded-none border-2 border-[#EAE6DF] bg-[#141414] p-2.5 text-sm text-[#EAE6DF]"
            />
            <button
              type="submit"
              disabled={sending || connStatus !== "LIVE"}
              className="rounded-none border-2 border-[#EAE6DF] bg-[#D9381E] px-4 text-xs font-bold uppercase text-[#EAE6DF] disabled:opacity-40"
            >
              SEND
            </button>
          </form>
        </>
      ) : (
        /* MODE B: STRUCTURED FORUM WITH MARKDOWN + MULTI-PHOTO + DELETE */
        <>
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowComposer((prev) => !prev)}
              className="w-full rounded-none border-2 border-[#EAE6DF] bg-[#D9381E] p-2.5 text-xs font-bold uppercase tracking-wider text-[#EAE6DF]"
            >
              {showComposer ? "[- CLOSE POST EDITOR]" : "[+ NEW FORUM POST / MULTI-PHOTO]"}
            </button>

            {showComposer && (
              <form
                onSubmit={handlePublishForumPost}
                className="space-y-2.5 border-2 border-[#EAE6DF] bg-[#141414] p-3"
              >
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block text-[10px] uppercase text-[#EAE6DF]/70">
                      CATEGORY
                    </label>
                    <select
                      value={postTag}
                      onChange={(e) => setPostTag(e.target.value as PostTag)}
                      className="w-full rounded-none border-2 border-[#EAE6DF] bg-black p-2 text-xs uppercase text-[#EAE6DF]"
                    >
                      <option value="GEAR">GEAR SETUP</option>
                      <option value="FOR SALE">FOR SALE / SWAP</option>
                      <option value="GIG / SHOW">GIG / SHOW</option>
                      <option value="RELEASE">NEW RELEASE</option>
                      <option value="TIPS">TIPS &amp; DIY</option>
                      <option value="DISCUSS">DISCUSS</option>
                    </select>
                  </div>

                  <div className="sm:col-span-2">
                    <label className="mb-1 block text-[10px] uppercase text-[#EAE6DF]/70">
                      HEADLINE / ITEM OR GIG TITLE
                    </label>
                    <input
                      type="text"
                      maxLength={90}
                      value={postSubject}
                      onChange={(e) => setPostSubject(e.target.value)}
                      placeholder="EX: CUSTOM PEDALBOARD / LANEY AMP FOR SALE"
                      className="w-full rounded-none border-2 border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                    />
                  </div>
                </div>

                {/* Markdown Formatting Toolbar + Preview Toggle */}
                <div>
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-1">
                    <span className="text-[10px] uppercase text-[#EAE6DF]/70">
                      MARKDOWN BODY *
                    </span>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => applyMarkdownSnippet("**", "**", "bold")}
                        className="border border-[#EAE6DF]/40 bg-black px-1.5 py-0.5 text-[10px] font-bold"
                      >
                        B
                      </button>
                      <button
                        type="button"
                        onClick={() => applyMarkdownSnippet("*", "*", "italic")}
                        className="border border-[#EAE6DF]/40 bg-black px-1.5 py-0.5 text-[10px] italic"
                      >
                        I
                      </button>
                      <button
                        type="button"
                        onClick={() => applyMarkdownSnippet("## ", "", "SPECS")}
                        className="border border-[#EAE6DF]/40 bg-black px-1.5 py-0.5 text-[10px]"
                      >
                        H2
                      </button>
                      <button
                        type="button"
                        onClick={() => applyMarkdownSnippet("- ", "", "item")}
                        className="border border-[#EAE6DF]/40 bg-black px-1.5 py-0.5 text-[10px]"
                      >
                        LIST
                      </button>
                      <button
                        type="button"
                        onClick={() => applyMarkdownSnippet("> ", "", "quote")}
                        className="border border-[#EAE6DF]/40 bg-black px-1.5 py-0.5 text-[10px]"
                      >
                        QUOTE
                      </button>
                      <button
                        type="button"
                        onClick={() => applyMarkdownSnippet("`", "`", "150 RON")}
                        className="border border-[#EAE6DF]/40 bg-black px-1.5 py-0.5 text-[10px] text-[#33FF00]"
                      >
                        TAG
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewMarkdown((p) => !p)}
                        className={`border px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                          previewMarkdown
                            ? "border-[#33FF00] bg-[#33FF00] text-[#0D0D0D]"
                            : "border-[#33FF00] text-[#33FF00]"
                        }`}
                      >
                        {previewMarkdown ? "EDIT" : "PREVIEW"}
                      </button>
                    </div>
                  </div>

                  {previewMarkdown ? (
                    <div className="min-h-[84px] border-2 border-[#33FF00]/60 bg-black p-2.5">
                      {postBody.trim() ? (
                        <MarkdownBody content={postBody} />
                      ) : (
                        <span className="text-xs italic text-[#EAE6DF]/50">
                          Nothing to preview yet...
                        </span>
                      )}
                    </div>
                  ) : (
                    <textarea
                      ref={textareaRef}
                      rows={4}
                      maxLength={1400}
                      required
                      value={postBody}
                      onChange={(e) => setPostBody(e.target.value)}
                      placeholder={`Supports **bold**, *italic*, ## headings, - bullet lists, > quotes & links...`}
                      className="w-full rounded-none border-2 border-[#EAE6DF] bg-black p-2 text-xs text-[#EAE6DF]"
                    />
                  )}
                </div>

                {/* Multi-Photo Picker (Up to 4 photos) */}
                <div>
                  <div className="mb-1 flex items-center justify-between text-[10px] uppercase text-[#EAE6DF]/70">
                    <span>
                      PHOTOS ({postPhotoFiles.length}/{MAX_PHOTOS_PER_POST}):
                    </span>
                    {postPhotoFiles.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setPostPhotoFiles([]);
                          setPostPhotoPreviews([]);
                        }}
                        className="text-[#D9381E] underline"
                      >
                        CLEAR ALL
                      </button>
                    )}
                  </div>

                  {postPhotoFiles.length < MAX_PHOTOS_PER_POST && (
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleSelectPostPhotos}
                      className="w-full border-2 border-[#EAE6DF] bg-black p-1.5 text-[11px] text-[#EAE6DF]"
                    />
                  )}

                  {postPhotoPreviews.length > 0 && (
                    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {postPhotoPreviews.map((src, idx) => (
                        <div
                          key={idx}
                          className="relative border border-[#33FF00] bg-black p-1"
                        >
                          <img
                            src={src}
                            alt={`Upload ${idx + 1}`}
                            className="h-24 w-full object-cover"
                          />
                          <button
                            type="button"
                            onClick={() => removeDraftPhoto(idx)}
                            className="absolute right-1 top-1 border border-[#EAE6DF] bg-[#D9381E] px-1.5 py-0.5 text-[10px] font-bold text-[#EAE6DF]"
                          >
                            X
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={sending || connStatus !== "LIVE"}
                  className="w-full rounded-none border-2 border-[#EAE6DF] bg-[#33FF00] p-2 text-xs font-bold uppercase tracking-wider text-[#0D0D0D] disabled:opacity-40"
                >
                  {sending
                    ? `UPLOADING ${postPhotoFiles.length} PHOTO(S)...`
                    : "PUBLISH POST TO BOARD"}
                </button>
              </form>
            )}

            <div className="flex flex-wrap gap-1.5 pt-1">
              {(
                ["ALL", "GEAR", "FOR SALE", "GIG / SHOW", "RELEASE", "TIPS", "DISCUSS"] as const
              ).map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => setFilterTag(tag)}
                  className={`border px-2 py-1 text-[10px] font-bold uppercase ${
                    filterTag === tag
                      ? "border-[#33FF00] bg-[#33FF00] text-[#0D0D0D]"
                      : "border-[#EAE6DF]/40 bg-[#141414] text-[#EAE6DF]/80"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            {forumPosts.length === 0 ? (
              <div className="border-2 border-dashed border-[#EAE6DF]/30 bg-[#141414] p-4 text-xs italic text-[#EAE6DF]/60">
                &gt;&gt; No dispatches under [{filterTag}] yet. Hit [+ NEW FORUM POST] to post first.
              </div>
            ) : (
              forumPosts.map((post) => {
                const canDelete = isPostAuthor(post);
                return (
                  <article
                    key={post.id}
                    className="space-y-2 border-2 border-[#EAE6DF] bg-[#141414] p-3"
                  >
                    <div className="flex items-center justify-between gap-2 border-b border-[#EAE6DF]/20 pb-1.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`border px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                            tagBadgeStyle[post.tag]
                          }`}
                        >
                          {post.tag}
                        </span>
                        <span className="text-xs font-bold text-[#33FF00]">@{post.nickname}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="whitespace-nowrap text-[10px] text-[#EAE6DF]/50">
                          {new Date(post.created_at).toLocaleString("ro-RO", {
                            month: "short",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        {canDelete && (
                          <button
                            type="button"
                            disabled={deletingId === post.id}
                            onClick={() => handleDeletePost(post.id)}
                            className="border border-[#D9381E] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#D9381E] hover:bg-[#D9381E] hover:text-[#EAE6DF]"
                          >
                            {deletingId === post.id ? "..." : "DELETE"}
                          </button>
                        )}
                      </div>
                    </div>

                    {post.subject && (
                      <h3 className="text-sm font-bold uppercase text-[#EAE6DF]">{post.subject}</h3>
                    )}

                    {/* Multi-Photo Grid */}
                    {post.imageUrls.length > 0 && (
                      <div
                        className={`grid gap-2 ${
                          post.imageUrls.length === 1 ? "grid-cols-1" : "grid-cols-2"
                        }`}
                      >
                        {post.imageUrls.map((url, idx) => (
                          <img
                            key={idx}
                            src={url}
                            alt={`${post.subject || "Post"} photo ${idx + 1}`}
                            onClick={() => setLightboxUrl(url)}
                            className="max-h-64 w-full cursor-pointer border border-[#EAE6DF]/40 bg-black object-cover hover:border-[#33FF00]"
                          />
                        ))}
                      </div>
                    )}

                    <MarkdownBody content={post.body} />
                  </article>
                );
              })
            )}
          </div>
        </>
      )}

      {/* Fullscreen Photo Lightbox */}
      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
        >
          <div className="relative max-h-full max-w-2xl border-2 border-[#EAE6DF] bg-[#0D0D0D] p-2">
            <img
              src={lightboxUrl}
              alt="Enlarged attachment"
              className="max-h-[80vh] w-auto object-contain"
            />
            <button
              type="button"
              onClick={() => setLightboxUrl(null)}
              className="mt-2 w-full border border-[#EAE6DF] bg-[#D9381E] py-1.5 text-xs font-bold uppercase text-[#EAE6DF]"
            >
              [X] CLOSE IMAGE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
