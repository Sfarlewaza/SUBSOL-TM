import { useEffect, useRef, useState } from "react";
import { ensureAuth, supabase } from "../utils/supabaseClient";

interface CommsRoomProps {
  handle: string;
  points: number;
}

interface ChatMessage {
  id: string;
  nickname: string;
  content: string;
  created_at: string;
}

const PUBLIC_ROOM = "FREQ0077";
const SECRET_GIG_ROOM = "SUBSOL89";

function generateRoomCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => chars[b % chars.length])
    .join("");
}

export default function CommsRoom({ handle, points }: CommsRoomProps) {
  const nickname = (handle || "LISTENER").trim().slice(0, 24);
  const canAccessSecretRoom = points >= 150;

  const [activeRoomCode, setActiveRoomCode] = useState<string | null>(null);
  const [joinInput, setJoinInput] = useState("");
  const [customCodeInput, setCustomCodeInput] = useState("");
  const [lobbyStatus, setLobbyStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [connStatus, setConnStatus] = useState("OFFLINE");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const roomIdRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string>(crypto.randomUUID());
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function enterRoom(codeToJoin: string, autoCreateIfMissing = false) {
    const cleanCode = codeToJoin.trim().toUpperCase();
    if (!/^[A-Z0-9]{8}$/.test(cleanCode)) {
      setLobbyStatus("[X] ROOM CODE MUST BE 8 ALPHANUMERIC CHARS.");
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
    setLobbyStatus(">> ALLOCATING PIRATE FREQUENCY...");

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
          setActiveRoomCode(data.room_code);
          return;
        }
        if (error?.code === "23505" && custom) {
          setLobbyStatus("[X] FREQUENCY CODE ALREADY TAKEN.");
          return;
        }
      }
      setLobbyStatus("[X] COULD NOT ALLOCATE FREQUENCY.");
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
          const incoming = payload.new as ChatMessage;
          setMessages((prev) =>
            prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming]
          );
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
          .order("created_at", { ascending: false })
          .limit(100);

        if (!cancelled && history) {
          setMessages(history.reverse());
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

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    const content = draft.trim();
    if (!content || !roomIdRef.current || sending) return;

    setSending(true);
    try {
      const { error } = await supabase.from("messages").insert({
        room_id: roomIdRef.current,
        nickname,
        content: content.slice(0, 1000),
      });
      if (error) throw error;
      setDraft("");
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  if (!activeRoomCode) {
    return (
      <div className="space-y-4 font-mono text-[#EAE6DF]">
        <div className="flex items-center justify-between border-b-2 border-[#EAE6DF] pb-2">
          <h2 className="text-lg font-bold uppercase tracking-widest">// Underground Comms</h2>
          <span className="text-xs text-[#33FF00]">@{nickname}</span>
        </div>

        <p className="text-xs leading-relaxed text-[#EAE6DF]/80">
          Tune into an 8-character Samizdat radio room for secret gig drops, merch announcements,
          and local band jam coordination.
        </p>

        <div className="space-y-2">
          <div className="text-[11px] font-bold uppercase text-[#EAE6DF]/70">
            OFFICIAL FREQUENCIES:
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => enterRoom(PUBLIC_ROOM, true)}
            className="flex w-full items-center justify-between border-2 border-[#EAE6DF] bg-[#141414] p-3 text-left hover:border-[#33FF00]"
          >
            <div>
              <div className="text-sm font-bold uppercase text-[#33FF00]">
                [{PUBLIC_ROOM}] PUBLIC BULLETIN &amp; JAMS
              </div>
              <div className="text-[11px] text-[#EAE6DF]/70">
                Open frequency // Announcements, gear &amp; open jam sessions
              </div>
            </div>
            <span className="text-xs font-bold uppercase">&gt;&gt; TUNE</span>
          </button>

          <button
            type="button"
            disabled={busy || !canAccessSecretRoom}
            onClick={() => enterRoom(SECRET_GIG_ROOM, true)}
            className="flex w-full items-center justify-between border-2 border-[#EAE6DF] bg-[#141414] p-3 text-left disabled:opacity-45"
          >
            <div>
              <div className="text-sm font-bold uppercase text-[#D9381E]">
                [{canAccessSecretRoom ? SECRET_GIG_ROOM : "LOCKED"}] SECRET GIGS &amp; MERCH DROPS
              </div>
              <div className="text-[11px] text-[#EAE6DF]/70">
                {canAccessSecretRoom
                  ? "Clearance verified // Secret basement shows & zine drops"
                  : "Requires 150 PTS (Unlock 1 landmark to reveal frequency)"}
              </div>
            </div>
            <span className="text-xs font-bold uppercase">
              {canAccessSecretRoom ? ">> TUNE" : "[LOCKED]"}
            </span>
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void enterRoom(joinInput, false);
          }}
          className="space-y-2 border-2 border-[#EAE6DF] bg-[#141414] p-3"
        >
          <label className="block text-xs font-bold uppercase">
            ENTER BAND / SECRET ROOM CODE (8 CHARS):
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
          <div className="text-xs font-bold uppercase">
            BROADCAST NEW PRIVATE FREQUENCY (BANDS / CREWS):
          </div>
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

        {lobbyStatus && (
          <p className="border border-[#D9381E] bg-[#141414] p-2 text-xs uppercase text-[#D9381E]">
            {lobbyStatus}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col space-y-3 font-mono text-[#EAE6DF]">
      <div className="flex items-center justify-between border-b-2 border-[#EAE6DF] pb-2">
        <div>
          <span className="text-xs text-[#EAE6DF]/60">FREQ: </span>
          <strong className="text-base tracking-widest text-[#33FF00]">{activeRoomCode}</strong>
          <span className="ml-2 text-[10px] uppercase text-[#EAE6DF]/70">[{connStatus}]</span>
        </div>
        <button
          type="button"
          onClick={() => setActiveRoomCode(null)}
          className="border border-[#D9381E] px-2 py-1 text-xs font-bold uppercase text-[#D9381E]"
        >
          &lt;- LEAVE
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 border border-[#EAE6DF]/30 bg-[#141414] px-2.5 py-1.5 text-[11px]">
        <span className="text-[#33FF00]">● {onlineUsers.length} ONLINE:</span>
        {onlineUsers.map((u) => (
          <span key={u} className="bg-black px-1.5 py-0.5 text-[#EAE6DF]">
            @{u}
          </span>
        ))}
      </div>

      <div className="h-80 space-y-3 overflow-y-auto border-2 border-[#EAE6DF] bg-[#0D0D0D] p-3">
        {messages.length === 0 ? (
          <p className="text-xs italic text-[#EAE6DF]/50">
            &gt;&gt; Frequency clear. Transmit the first message...
          </p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="border-b border-[#EAE6DF]/15 pb-2">
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="font-bold text-[#33FF00]">@{m.nickname}</span>
                <span className="text-[#EAE6DF]/50">
                  {new Date(m.created_at).toLocaleTimeString("ro-RO", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm text-[#EAE6DF]">
                {m.content}
              </p>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSendMessage} className="flex gap-2">
        <input
          type="text"
          maxLength={1000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={`Transmit as @${nickname}...`}
          className="flex-1 rounded-none border-2 border-[#EAE6DF] bg-[#141414] p-2.5 text-sm text-[#EAE6DF]"
        />
        <button
          type="submit"
          disabled={sending || connStatus !== "LIVE"}
          className="rounded-none border-2 border-[#EAE6DF] bg-[#D9381E] px-4 text-xs font-bold uppercase tracking-wider text-[#EAE6DF] disabled:opacity-40"
        >
          SEND
        </button>
      </form>
    </div>
  );
}
