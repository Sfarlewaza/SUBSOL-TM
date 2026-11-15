import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

export interface RealVenuePin {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
}

export interface MapGigSummary {
  id: string;
  band: string;
  title: string;
  date: string;
  time: string;
  venueId: string;
  genre: string;
  isSecret?: boolean;
}

export const TIMISOARA_REAL_VENUES: RealVenuePin[] = [
  {
    id: "manufactura",
    name: "MANUFACTURA",
    address: "Splaiul Tudor Vladimirescu 9, Timișoara",
    lat: 45.7478,
    lng: 21.2179,
  },
  {
    id: "darc",
    name: "D'ARC PE MAL",
    address: "Bulevardul Vasile Pârvan 5, Timișoara",
    lat: 45.7512,
    lng: 21.2298,
  },
  {
    id: "reflektor",
    name: "REFLEKTOR VENUE",
    address: "Calea Buziașului 11, Timișoara",
    lat: 45.7366,
    lng: 21.2498,
  },
  {
    id: "casatineretului",
    name: "CASA TINERETULUI",
    address: "Strada Arieș 19, Timișoara",
    lat: 45.7438,
    lng: 21.2414,
  },
  {
    id: "unirii-subsol",
    name: "SUBSOL UNIRII",
    address: "Piața Unirii, Timișoara",
    lat: 45.7579,
    lng: 21.2291,
  },
];

export function buildDirectionsUrl(venue: RealVenuePin): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${venue.lat},${venue.lng}&travelmode=walking`;
}

interface GigRadarMapProps {
  venues: RealVenuePin[];
  gigs: MapGigSummary[];
  selectedVenueId: string | "ALL";
  onSelectVenue: (venueId: string | "ALL") => void;
}

export default function GigRadarMap({
  venues,
  gigs,
  selectedVenueId,
  onSelectVenue,
}: GigRadarMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [45.7495, 21.2325],
      zoom: 13,
      zoomControl: true,
      attributionControl: false,
    });

    // Free OpenStreetMap tiles (zero API key required) + dark-mode filter on tile pane
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
    }).addTo(map);

    const tilePane = map.getPane("tilePane");
    if (tilePane) {
      tilePane.style.filter =
        "invert(92%) hue-rotate(180deg) brightness(92%) contrast(95%) saturate(65%)";
    }

    const layerGroup = L.layerGroup().addTo(map);
    mapRef.current = map;
    markersLayerRef.current = layerGroup;

    setTimeout(() => map.invalidateSize(), 150);

    return () => {
      map.remove();
      mapRef.current = null;
      markersLayerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = markersLayerRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    venues.forEach((venue) => {
      const venueGigs = gigs.filter((g) => g.venueId === venue.id);
      const isSelected = selectedVenueId === venue.id;

      const pinHtml = `
        <div style="
          display:inline-block;
          background:${isSelected ? "#33FF00" : "#D9381E"};
          color:${isSelected ? "#0D0D0D" : "#EAE6DF"};
          border:2px solid #EAE6DF;
          font-family:monospace;
          font-size:10px;
          font-weight:bold;
          padding:2px 6px;
          white-space:nowrap;
          box-shadow:0 2px 8px rgba(0,0,0,0.9);
          transform:translate(-50%, -50%);
        ">
          ${venue.name} [${venueGigs.length}]
        </div>
      `;

      const icon = L.divIcon({
        html: pinHtml,
        className: "",
        iconSize: [0, 0],
      });

      const directionsHref = buildDirectionsUrl(venue);
      const gigLines =
        venueGigs.length > 0
          ? venueGigs
              .map(
                (g) =>
                  `<div style="margin-top:4px;border-top:1px dashed #666;padding-top:3px;">
                    <strong style="color:#33FF00;">${g.date} ${g.time}</strong><br/>
                    <span>${g.band} — ${g.title}</span>
                  </div>`
              )
              .join("")
          : `<div style="margin-top:4px;opacity:0.7;">No scheduled shows yet.</div>`;

      const popupHtml = `
        <div style="font-family:monospace;font-size:11px;color:#EAE6DF;background:#141414;padding:4px;min-width:185px;">
          <div style="font-weight:bold;color:#D9381E;text-transform:uppercase;">${venue.name}</div>
          <div style="font-size:10px;opacity:0.8;">${venue.address}</div>
          ${gigLines}
          <a href="${directionsHref}" target="_blank" rel="noopener noreferrer"
             style="display:block;margin-top:7px;background:#33FF00;color:#0D0D0D;text-align:center;font-weight:bold;padding:4px 6px;text-decoration:none;text-transform:uppercase;">
            ↗ GET DIRECTIONS (WALK/TRANSIT)
          </a>
        </div>
      `;

      const marker = L.marker([venue.lat, venue.lng], { icon })
        .bindPopup(popupHtml)
        .on("click", () => {
          onSelectVenue(isSelected ? "ALL" : venue.id);
        });

      marker.addTo(layerGroup);

      if (isSelected) {
        map.setView([venue.lat, venue.lng], 15, { animate: true });
        marker.openPopup();
      }
    });

    if (selectedVenueId === "ALL") {
      map.setView([45.7495, 21.2325], 13, { animate: true });
    }
  }, [venues, gigs, selectedVenueId, onSelectVenue]);

  return (
    <div className="space-y-1.5">
      <div className="relative border-2 border-[#EAE6DF]/70 bg-[#0A0A0A]">
        <div ref={containerRef} className="h-60 w-full z-0" />
        <div className="pointer-events-none absolute bottom-1.5 left-1.5 z-[400] bg-black/85 border border-[#33FF00]/60 px-2 py-0.5 text-[9px] font-bold uppercase text-[#33FF00]">
          DRAG / ZOOM TIMIȘOARA MAP • TAP PIN FOR DIRECTIONS
        </div>
      </div>

      <div className="flex flex-wrap gap-1 pt-0.5">
        {venues.map((v) => {
          const active = selectedVenueId === v.id;
          return (
            <button
              key={v.id}
              type="button"
              onClick={() => onSelectVenue(active ? "ALL" : v.id)}
              className={`px-1.5 py-0.5 text-[9px] font-bold uppercase border ${
                active
                  ? "border-[#33FF00] bg-[#33FF00] text-[#0D0D0D]"
                  : "border-[#EAE6DF]/35 bg-black text-[#EAE6DF]/80"
              }`}
            >
              📍 {v.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
