"use client";

import { useEffect, useRef, useState, type ComponentType } from "react";
import type { ProjectedGraph } from "@/lib/livingTrace/graph";

// Deferred Discover. The homepage ships only this small island and a
// server-rendered preview (children). The island fetches the interactive
// constellation's code and its (already projected, static) graph, then
// swaps them in, at the first of:
//   - the address deep-links into Discover (#discover or ?edge=)
//   - Discover comes within ~600px of the viewport
//   - the browser is idle after the page has loaded, so a keyboard user
//     tabbing quickly never passes Discover before its controls exist
// First paint carries neither the drawing's JavaScript nor the graph.
//
// If loading fails, the preview, which already lists every relationship,
// simply stays. Nothing is hidden behind the load.
type ConstellationProps = {
  graph: ProjectedGraph;
  initialEdgeId?: string;
  headingLevel?: 2 | 3;
  syncUrl?: boolean;
};

const GRAPH_URL = "/living-trace/graph.json";

export default function ConstellationIsland({
  children,
  initialEdgeId,
  syncUrl = false,
}: {
  children: React.ReactNode;
  initialEdgeId?: string;
  syncUrl?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [loaded, setLoaded] = useState<{ Component: ComponentType<ConstellationProps>; graph: ProjectedGraph } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    let cancelled = false;
    let started = false;
    const load = () => {
      if (started) {
        return;
      }
      started = true;
      observer?.disconnect();
      Promise.all([import("./Constellation"), fetch(GRAPH_URL).then((r) => (r.ok ? (r.json() as Promise<ProjectedGraph>) : Promise.reject(r.status)))])
        .then(([mod, graph]) => {
          if (!cancelled) {
            setLoaded({ Component: mod.default, graph });
          }
        })
        .catch(() => {
          // Keep the preview: it is already complete as text.
        });
    };
    const deepLinked = window.location.hash === "#discover" || new URLSearchParams(window.location.search).has("edge");
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && load(), { rootMargin: "600px 0px" });
    let idle: number | undefined;
    const scheduleIdle = () => {
      idle =
        typeof window.requestIdleCallback === "function"
          ? window.requestIdleCallback(load, { timeout: 4000 })
          : window.setTimeout(load, 2000);
    };
    if (deepLinked || !observer) {
      load();
    } else {
      observer.observe(el);
      if (document.readyState === "complete") {
        scheduleIdle();
      } else {
        window.addEventListener("load", scheduleIdle, { once: true });
      }
    }
    return () => {
      cancelled = true;
      observer?.disconnect();
      window.removeEventListener("load", scheduleIdle);
      if (idle !== undefined) {
        if (typeof window.cancelIdleCallback === "function") {
          window.cancelIdleCallback(idle);
        }
        window.clearTimeout(idle);
      }
    };
  }, []);

  return (
    <div ref={ref}>
      {loaded ? <loaded.Component graph={loaded.graph} initialEdgeId={initialEdgeId} syncUrl={syncUrl} /> : children}
    </div>
  );
}
