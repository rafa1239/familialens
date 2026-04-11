import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useStore } from "../store";
import { EVENT_META } from "../eventMeta";
import type { FamilyEvent } from "../types";
import { useFocusSet, eventInFocus } from "./useFocusSet";

/**
 * Map view. Shows every event whose place has lat/lon as a dot on a
 * Carto Positron (light-matched) base layer. Clicking a dot opens a
 * popup with the event details and selects the event in the store.
 *
 * Phase 5 is deliberately minimal: no geocoding, no layers, no timeline
 * scrubbing. Users set lat/lon by hand in the inspector.
 */
export function MapView() {
  const data = useStore((s) => s.data);
  const selectEvent = useStore((s) => s.selectEvent);
  const selectPerson = useStore((s) => s.selectPerson);
  const focusSet = useFocusSet();
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  // Events with coordinates, respecting focus
  const geoEvents = useMemo(() => {
    const list: FamilyEvent[] = [];
    for (const ev of Object.values(data.events)) {
      if (
        ev.place &&
        typeof ev.place.lat === "number" &&
        typeof ev.place.lon === "number" &&
        eventInFocus(focusSet, ev.people)
      ) {
        list.push(ev);
      }
    }
    return list;
  }, [data.events, focusSet]);

  // Init map once
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, {
      center: [40, 0],
      zoom: 2,
      minZoom: 2,
      worldCopyJump: true,
      zoomControl: true,
      attributionControl: true
    });
    L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
      {
        attribution:
          '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>',
        subdomains: "abcd",
        maxZoom: 19
      }
    ).addTo(map);
    mapRef.current = map;
    layerRef.current = L.layerGroup().addTo(map);

    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
  }, []);

  // Paint markers whenever geoEvents change
  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();

    if (geoEvents.length === 0) return;

    const latlngs: L.LatLngExpression[] = [];
    for (const ev of geoEvents) {
      const { lat, lon } = ev.place!;
      const meta = EVENT_META[ev.type];
      const people = ev.people
        .map((pid) => data.people[pid])
        .filter(Boolean);
      const marker = L.circleMarker([lat!, lon!], {
        radius: 7,
        color: "#ffffff",
        weight: 2,
        fillColor: meta.color,
        fillOpacity: 0.9
      });
      const nameList = people.map((p) => p.name).join(", ");
      const dateStr = ev.date?.display ?? "";
      const placeStr = ev.place!.name;
      marker.bindPopup(
        `<div style="font-family: Inter, sans-serif; font-size: 13px;">
          <div style="font-weight: 600; margin-bottom: 2px;">${escapeHtml(meta.label)}</div>
          <div style="color: #6f6658; font-size: 11px; margin-bottom: 4px;">${escapeHtml(dateStr)}${dateStr && placeStr ? " · " : ""}${escapeHtml(placeStr)}</div>
          <div>${escapeHtml(nameList)}</div>
        </div>`
      );
      marker.on("click", () => {
        selectEvent(ev.id);
        if (people[0]) selectPerson(people[0].id);
      });
      marker.addTo(layer);
      latlngs.push([lat!, lon!]);
    }

    // Fit bounds on first render / when geo events change
    if (latlngs.length === 1) {
      map.setView(latlngs[0], Math.max(map.getZoom(), 5));
    } else {
      map.fitBounds(L.latLngBounds(latlngs), { padding: [40, 40], maxZoom: 8 });
    }
  }, [geoEvents, data.people, selectEvent, selectPerson]);

  if (geoEvents.length === 0) {
    return (
      <div className="map-wrap">
        <div ref={containerRef} className="map-canvas" />
        <div className="map-empty">
          <p>No placed events yet.</p>
          <p className="helper">
            Add coordinates to a place in the inspector (e.g. <code>38.72, -9.14</code>)
            to see events appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="map-wrap">
      <div ref={containerRef} className="map-canvas" />
    </div>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
