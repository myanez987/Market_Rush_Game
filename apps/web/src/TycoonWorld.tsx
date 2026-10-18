import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { WebGPURenderer } from "three/webgpu";
import { getAction, getVenture, seededRandom, type GamePhase, type PublicMarketSignal, type PublicPlayer, type WorldDirective, type WorldEventVisual } from "@market-rush/shared";
import { computePlazaLayout, createPedestrianRoute, intersectsStorefront, type PlazaLayout, type PlazaPoint } from "./plazaLayout.js";
import { createPlazaAssets, createPlazaEnvironment, createReactionSprite, disposePlaza, PLAYER_COLORS, type StorefrontBuild } from "./plazaScene.js";
import { buildModularStore, inventoryStacks, playerTier, TIER_LABELS } from "./districtArchitecture.js";
import { InstancedCrowd, type NpcAnimation, type NpcPose } from "./npcCrowd.js";
import { createDistrictAtmosphere } from "./districtAtmosphere.js";
import { DistrictPerformance } from "./districtPerformance.js";
import { createDistrictPostprocessing } from "./districtPostprocessing.js";
import { createDistrictTraffic, nearestRoadGate, type MarketingStop } from "./districtTraffic.js";
import { serviceSample, serviceSentiment } from "./serviceSentiment.js";
import { DistrictAudio } from "./districtAudio.js";

interface TycoonWorldProps {
  players: PublicPlayer[]; day: number; phase: GamePhase; directive?: WorldDirective; phaseEndsAt?: number;
  marketEventId?: string; compact?: boolean; myPlayerId?: string; publicSignals?: PublicMarketSignal[];
  selectedPlayerId?: string; onSelectPlayer?: (playerId: string) => void;
}
interface Path { points: THREE.Vector3[]; cumulative: number[]; total: number; }
interface Customer { pose: NpcPose; path: Path; offset: number; wait: number; purchased: boolean; abandons: boolean; bubbles?: { reason: THREE.Sprite; waiting: THREE.Sprite; purchase: THREE.Sprite; abandon: THREE.Sprite; service: THREE.Sprite }; defection: boolean; busPlayerId?: string; }
interface Departure { pose: NpcPose; path: Path; start: number; duration: number; }
interface Runtime { layout: PlazaLayout; camera: THREE.PerspectiveCamera; goalPosition: THREE.Vector3; goalTarget: THREE.Vector3; target: THREE.Vector3; stores: Map<string, StorefrontBuild>; mobile: boolean; }
const EVENT_VISUAL: Record<string, WorldEventVisual> = { cautious: "rain", storm: "rain", boom: "festival", festival: "festival", supply: "supply", labor: "labor", digital: "digital", rates: "rates" };
const EVENT_LABEL: Record<WorldEventVisual, string> = { clear: "CLEAR SKIES", rain: "STORM · WET STREETS", festival: "CITY FESTIVAL", supply: "DELIVERY WEEK", labor: "LABOR ALERT", digital: "DIGITAL SURGE", rates: "RATE RISE" };

function pathFrom(route: PlazaPoint[]): Path {
  const points = route.map((p) => new THREE.Vector3(p.x, .35, p.z)), cumulative = [0];
  for (let i = 1; i < points.length; i++) cumulative.push(cumulative[i - 1]! + points[i]!.distanceTo(points[i - 1]!));
  return { points, cumulative, total: cumulative.at(-1) ?? 0 };
}
function samplePath(path: Path, progress: number, out: THREE.Vector3) {
  const distance = THREE.MathUtils.clamp(progress, 0, 1) * path.total;
  let segment = 1;
  while (segment < path.points.length - 1 && path.cumulative[segment]! < distance) segment++;
  const start = path.points[segment - 1]!, end = path.points[segment]!;
  out.copy(start).lerp(end, (distance - path.cumulative[segment - 1]!) / Math.max(.0001, path.cumulative[segment]! - path.cumulative[segment - 1]!));
  return Math.atan2(end.x - start.x, end.z - start.z);
}
function cameraPose(layout: PlazaLayout, selected: string | undefined, zoom: number, mobile: boolean, aspect = 1) {
  const entry = layout.entries.find((p) => p.playerId === selected);
  if (!entry) { const d = layout.overviewDistance * (mobile ? 1.12 : 1) * Math.max(1, .98 / aspect) / (1 + zoom * .1); return { position: new THREE.Vector3(d * .6, d * (mobile ? .8 : .62), d * .75), target: new THREE.Vector3(0, .7, 0) }; }
  const target = new THREE.Vector3(entry.position.x * .88, 1.05, entry.position.z * .88);
  return { position: target.clone().add(new THREE.Vector3(6.5, mobile ? 8.2 : 5.8, 7.6).multiplyScalar(1 / (1 + zoom * .15))), target };
}

export function TycoonWorld({ players, day, phase, directive, phaseEndsAt, marketEventId, compact = false, myPlayerId, publicSignals = [], selectedPlayerId, onSelectPlayer }: TycoonWorldProps) {
  const mountRef = useRef<HTMLDivElement>(null), metricsRef = useRef<HTMLOutputElement>(null), runtimeRef = useRef<Runtime | undefined>(undefined);
  const postRef = useRef<ReturnType<typeof createDistrictPostprocessing> | undefined>(undefined);
  const rendererRef = useRef<WebGPURenderer | undefined>(undefined);
  const rendererReadyRef = useRef<Promise<WebGPURenderer> | undefined>(undefined);
  const setupChainRef = useRef<Promise<void>>(Promise.resolve());
  const audioRef = useRef<DistrictAudio | null>(null);
  const [failed, setFailed] = useState(false), [loading, setLoading] = useState(true), [selected, setSelected] = useState(myPlayerId), [overview, setOverview] = useState(true), [zoom, setZoom] = useState(0);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const qaEnabled = new URLSearchParams(window.location.search).get("graphicsQA") === "1";
  const [qaMode, setQaMode] = useState<"live" | "clear" | "storm">("live");
  const [aoIntensity, setAoIntensity] = useState(.7);
  const active = useMemo(() => players.filter((p) => !p.spectator), [players]);
  const selectedId = selectedPlayerId ?? selected;
  const event = qaMode === "storm" ? "rain" : qaMode === "clear" ? "clear" : directive?.eventVisual ?? EVENT_VISUAL[marketEventId ?? ""] ?? "clear";
  const selectionRef = useRef<(id: string) => void>(() => undefined);
  const viewRef = useRef({ overview, selectedId, zoom }); viewRef.current = { overview, selectedId, zoom };
  const phaseRef = useRef({ phase, phaseEndsAt, start: Date.now() });
  if (phaseRef.current.phase !== phase || phaseRef.current.phaseEndsAt !== phaseEndsAt) phaseRef.current = { phase, phaseEndsAt, start: Date.now() };
  selectionRef.current = (id) => { setSelected(id); setOverview(false); onSelectPlayer?.(id); };
  const key = `${active.map((p) => `${p.id}:${p.ventureId}:${playerTier(p)}:${inventoryStacks(p)}`).join("|")}:${day}:${event}:${directive?.seed ?? "preview"}:${qaMode}:${compact}`;

  useEffect(() => { if (selectedPlayerId) setOverview(false); }, [selectedPlayerId]);
  useEffect(() => { audioRef.current?.setScene(phase, event); }, [phase, event]);
  useEffect(() => () => { const audio = audioRef.current; audioRef.current = null; if (audio) void audio.dispose(); }, []);
  useEffect(() => { postRef.current?.setAmbientOcclusion(aoIntensity); }, [aoIntensity]);
  const toggleSound = async () => {
    if (audioRef.current) {
      const audio = audioRef.current; audioRef.current = null; setSoundEnabled(false); await audio.dispose();
      return;
    }
    const audio = new DistrictAudio(); audioRef.current = audio;
    try { await audio.start(); if (audioRef.current === audio) { audio.setScene(phase, event); setSoundEnabled(true); } }
    catch (error) { console.warn("District audio unavailable", error); if (audioRef.current === audio) audioRef.current = null; void audio.dispose(); setSoundEnabled(false); }
  };
  useEffect(() => {
    const runtime = runtimeRef.current; if (!runtime) return;
    const pose = cameraPose(runtime.layout, overview ? undefined : selectedId, zoom, runtime.mobile, runtime.camera.aspect);
    runtime.goalPosition.copy(pose.position); runtime.goalTarget.copy(pose.target);
    runtime.stores.forEach((store, id) => { store.selectionRing.visible = !overview && id === selectedId; });
  }, [selectedId, overview, zoom]);

  useEffect(() => {
    const mount = mountRef.current; if (!mount || active.length === 0) return;
    let cancelled = false, frame = 0, cleanup: (() => void) | undefined;
    setFailed(false); setLoading(true);
    const initialize = async () => {
      const mobile = mount.clientWidth <= 620, reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
      let renderer = rendererRef.current;
      if (!renderer) {
        renderer = new WebGPURenderer({ forceWebGL: true, antialias: true, alpha: false, powerPreference: "high-performance" });
        rendererRef.current = renderer;
        rendererReadyRef.current = renderer.init();
      }
      try { await rendererReadyRef.current; } catch (error) {
        renderer.dispose(); rendererRef.current = undefined; rendererReadyRef.current = undefined;
        if (!cancelled) { console.error("District renderer initialization failed", error); setFailed(true); setLoading(false); }
        return;
      }
      if (cancelled) return;
      renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.04;
      renderer.setPixelRatio(Math.min(devicePixelRatio, mobile ? 1 : 1.35)); renderer.shadowMap.enabled = !mobile; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.setAttribute("aria-label", "Living District WebGL canvas"); renderer.domElement.dataset.renderer = "webgl2-tsl";
      if (renderer.domElement.parentElement !== mount) mount.appendChild(renderer.domElement);
      const scene = new THREE.Scene(), layout = computePlazaLayout(active.map((p) => p.id)), assets = createPlazaAssets(), random = seededRandom(directive?.seed ?? day * 971 + 7);
      const initial = cameraPose(layout, viewRef.current.overview ? undefined : viewRef.current.selectedId, viewRef.current.zoom, mobile, mount.clientWidth / Math.max(1, mount.clientHeight));
      const camera = new THREE.PerspectiveCamera(mobile ? 43 : 36, 1, .1, 100); camera.position.copy(initial.position); camera.lookAt(initial.target);
      const environment = createPlazaEnvironment(layout, event, mobile, assets, random); scene.add(environment.group);
      const marketingStops: MarketingStop[] = (qaMode !== "live" ? active.slice(0, 1).map((p) => p.id) : directive?.businesses.filter((business) => business.marketingSpend >= getAction("marketing")!.cost).map((business) => business.playerId) ?? []).map((playerId) => {
        const entry = layout.entries.find((e) => e.playerId === playerId)!;
        return { playerId, gateIndex: nearestRoadGate(entry.angle), color: PLAYER_COLORS[entry.index % PLAYER_COLORS.length]! };
      });
      const traffic = createDistrictTraffic(layout, event, assets, marketingStops, mobile); scene.add(traffic.group);
      const driverCaption = document.createElement("div");
      driverCaption.className = "driver-bubble";
      driverCaption.setAttribute("role", "status");
      driverCaption.setAttribute("aria-live", "polite");
      driverCaption.hidden = true;
      mount.appendChild(driverCaption);
      const atmosphere = createDistrictAtmosphere(scene, environment.paving, event === "rain", mobile, random);
      const postprocessing = createDistrictPostprocessing(renderer, scene, camera, mobile);
      postprocessing.setAmbientOcclusion(aoIntensity);
      postRef.current = postprocessing;
      const stores = new Map<string, StorefrontBuild>(), selectable: THREE.Object3D[] = [];
      active.forEach((player, i) => {
        const plan = directive?.businesses.find((b) => b.playerId === player.id);
        const store = buildModularStore(player, layout.entries[i]!, PLAYER_COLORS[i % PLAYER_COLORS.length]!, assets, qaMode === "live" ? playerTier(player) : 3, qaMode === "live" ? Math.max(inventoryStacks(player), plan?.inventoryPropCount ?? 0) : 8);
        stores.set(player.id, store); selectable.push(...store.selectable); scene.add(store.group);
      });
      const runtime: Runtime = { camera, layout, goalPosition: initial.position.clone(), goalTarget: initial.target.clone(), target: initial.target.clone(), stores, mobile }; runtimeRef.current = runtime;
      const crowd = new InstancedCrowd(80); scene.add(crowd.group);
      const customers: Customer[] = [], departures: Departure[] = [];
      const stress = qaMode !== "live";
      const staffAssignments = active.flatMap((player, index) => Array.from({ length: stress ? (index < 4 ? 1 : 0) : directive?.businesses.find((b) => b.playerId === player.id)?.staffCountAfter ?? 2 }, (_, slot) => ({ entry: layout.entries[index]!, slot })));
      const staffBudget = staffAssignments.length;
      const departuresBudget = stress ? 4 : directive?.staffEvents.length ?? 0;
      const customerBudget = stress ? 80 - staffBudget - Math.min(4, active.length) : Math.min(mobile ? 40 : 80, 80 - staffBudget - departuresBudget, directive?.businesses.reduce((sum, b) => sum + b.representedCustomers, 0) ?? 18);
      const cohorts = directive?.customerCohorts ?? [];
      const cohortsWeighted = cohorts.flatMap((c) => Array.from({ length: c.representedCustomers }, () => c));
      const busCounts = new Map<string, number>();
      for (let i = 0; i < customerBudget; i++) {
        const cohort = cohortsWeighted.length ? cohortsWeighted[Math.floor(i / customerBudget * cohortsWeighted.length)] : undefined;
        const destId = cohort?.destinationPlayerId ?? active[i % active.length]!.id;
        const plan = directive?.businesses.find((b) => b.playerId === destId);
        const busPlayerId = marketingStops.some((stop) => stop.playerId === destId) && (stress ? i < 5 : cohort?.reason === "marketing") && (busCounts.get(destId) ?? 0) < 5 ? destId : undefined;
        if (busPlayerId) busCounts.set(destId, (busCounts.get(destId) ?? 0) + 1);
        const gate = busPlayerId ? marketingStops.find((stop) => stop.playerId === busPlayerId)!.gateIndex : i % 4;
        const route = createPedestrianRoute(layout, destId, busPlayerId ? undefined : stress ? undefined : cohort?.originPlayerId, gate, ((i % 5) - 2) * .1);
        const identity = cohort?.id ?? destId, seed = directive?.seed ?? day * 971 + 7;
        const purchased = stress ? i % 3 !== 0 : serviceSample(seed, identity, i) < (plan?.conversionRate ?? 90) / 100;
        const wait = stress ? 18 : plan?.averageWaitSeconds ?? 6;
        const sentiment = serviceSentiment(stress ? 68 : plan?.satisfaction ?? 70, purchased, wait, serviceSample(seed, identity, i + 10_000));
        const mobility = i % 9 === 2 ? "bicycle" : i % 9 === 6 ? "hoverboard" : undefined;
        const pet = !mobility && i % 12 === 3 ? "dog" : !mobility && i % 12 === 7 ? "cat" : undefined;
        const pose: NpcPose = { position: new THREE.Vector3(), heading: 0, animation: "walk", visible: true, phase: i % 4, mobility, pet, sentiment };
        const path = pathFrom(route); samplePath(path, 0, pose.position); crowd.add(pose);
        let bubbles: Customer["bubbles"];
        if (i % 4 === 0) {
          const originPremium = (directive?.businesses.find((business) => business.playerId === cohort?.originPlayerId)?.priceTier ?? publicSignals.find((signal) => signal.playerId === cohort?.originPlayerId)?.observedPriceTier) === "premium";
          const priceLoss = cohort?.reason === "price" && Boolean(cohort?.originPlayerId) && originPremium;
          const icons = { price: "$$", wait: "⌛", trust: "♥", marketing: "!", capacity: "+" };
          bubbles = {
            reason: createReactionSprite(icons[cohort?.reason ?? "capacity"], priceLoss ? "#ffd3d4" : "#f0d780", priceLoss),
            waiting: createReactionSprite("...", "#eef4fa"),
            purchase: createReactionSprite("$$", "#9df1bb"),
            abandon: createReactionSprite(i % 2 ? "⌛" : "😠", "#ffb7aa"),
            service: createReactionSprite(sentiment === "satisfied" ? "☺" : sentiment === "mixed" ? "—" : "☹", sentiment === "satisfied" ? "#a9efc2" : sentiment === "mixed" ? "#ffe4a0" : "#ffb7aa")
          };
          Object.values(bubbles).forEach((sprite) => { sprite.visible = false; scene.add(sprite); });
        }
        customers.push({ pose, path, offset: busPlayerId ? (busCounts.get(destId)! - 1) * .018 : stress ? i / customerBudget : random() * .16, wait, purchased, abandons: !purchased && wait > 10, bubbles, defection: Boolean(cohort?.originPlayerId) && !busPlayerId, busPlayerId });
      }
      for (const { entry, slot } of staffAssignments) {
        const tangent = (slot - .5) * .22;
        crowd.add({ position: new THREE.Vector3(entry.servicePoint.x + entry.queueTangent.x * tangent, .35, entry.servicePoint.z + entry.queueTangent.z * tangent), heading: entry.rotationY, animation: "impatient", visible: true, staff: true, pegColor: PLAYER_COLORS[entry.index] });
      }
      const staffEvents = stress ? active.slice(0, 4).map((p, i) => ({ playerId: p.id, startsAtOffsetMs: i * 800, durationMs: 9_000 })) : directive?.staffEvents ?? [];
      staffEvents.forEach((e, i) => {
        const pose: NpcPose = { position: new THREE.Vector3(), heading: 0, animation: "frustrated", visible: false, staff: true, pegColor: PLAYER_COLORS[layout.entries.findIndex((p) => p.playerId === e.playerId)] };
        if (crowd.add(pose) < 0) return;
        const path = pathFrom(createPedestrianRoute(layout, e.playerId, undefined, i % 4).reverse());
        departures.push({ pose, path, start: (stress ? Date.now() : directive!.startsAt) + e.startsAtOffsetMs, duration: e.durationMs });
      });
      const metrics = metricsRef.current ? new DistrictPerformance(metricsRef.current) : undefined;
      const pointer = new THREE.Vector2(), ray = new THREE.Raycaster();
      const onPointerUp = (e: PointerEvent) => { const rect = renderer.domElement.getBoundingClientRect(); pointer.set((e.clientX - rect.left) / rect.width * 2 - 1, -(e.clientY - rect.top) / rect.height * 2 + 1); ray.setFromCamera(pointer, camera); const hit = ray.intersectObjects(selectable, false)[0]; if (hit?.object.userData.playerId) selectionRef.current(hit.object.userData.playerId as string); };
      renderer.domElement.addEventListener("pointerup", onPointerUp);
      const resize = () => { const w = mount.clientWidth, h = mount.clientHeight; renderer.setSize(w, h, false); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix(); };
      const observer = new ResizeObserver(resize); observer.observe(mount); resize();
      crowd.update(0, reducedMotion);
      let started = 0, last = 0;
      let trafficElapsed = 0;
      let renderError = false;
      const render = (timestamp: number) => {
        if (cancelled || renderError) return;
        const dt = Math.min(.06, (timestamp - last) / 1000); last = timestamp;
        const now = Date.now(), current = phaseRef.current;
        const progress = current.phaseEndsAt ? 1 - (current.phaseEndsAt - now) / Math.max(1, current.phaseEndsAt - current.start) : 0;
        const view = viewRef.current, goal = cameraPose(layout, view.overview ? undefined : view.selectedId, view.zoom, mobile, camera.aspect);
        runtime.goalPosition.copy(goal.position); runtime.goalTarget.copy(goal.target);
        camera.position.lerp(runtime.goalPosition, reducedMotion ? 1 : 1 - Math.exp(-dt * 7)); runtime.target.lerp(runtime.goalTarget, reducedMotion ? 1 : 1 - Math.exp(-dt * 7)); camera.lookAt(runtime.target);
        postprocessing.setFocusDistance(camera.position.distanceTo(runtime.target));
        stores.forEach((store, id) => { store.selectionRing.visible = !view.overview && id === view.selectedId; });
        atmosphere.update((timestamp - started) / 1000, stress ? "operations" : current.phase, stress ? .5 : progress, reducedMotion);
        const base = directive ? THREE.MathUtils.clamp((now - directive.startsAt) / (directive.endsAt - directive.startsAt), 0, 1) : (timestamp - started) / 24_000;
        const live = current.phase === "operations" || stress || current.phase === "lobby";
        if (live && !reducedMotion) trafficElapsed += dt;
        customers.forEach((c, i) => {
          const p = c.busPlayerId ? THREE.MathUtils.clamp((trafficElapsed - 4) / 16 - c.offset, 0, 1)
            : stress || !directive ? ((timestamp - started) / 22_000 + c.offset) % 1 : THREE.MathUtils.clamp((base - c.offset) / .84, 0, 1);
          const queue = p >= .52 && p < .74, leaving = p >= .74;
          const speed = c.pose.mobility ? 2 : 1;
          const travel = p < .52 ? Math.min(1, p / .52 * speed) : queue ? 1 : Math.max(0, 1 - (p - .74) / .26 * speed);
          if ((live || current.phase === "results") && !reducedMotion) c.pose.heading = samplePath(c.path, travel, c.pose.position) + (leaving ? Math.PI : 0);
          c.pose.visible = c.busPlayerId ? traffic.busHasArrived(c.busPlayerId, trafficElapsed) && p < 1 : stress || !directive || p > 0 && p < 1;
          c.pose.showSentiment = leaving && live;
          c.pose.animation = queue && c.wait > 10 ? "impatient" : leaving && c.abandons ? "frustrated" : "walk";
          if (!live) c.pose.animation = "impatient";
          if (c.bubbles) {
            const shown = c.pose.visible && live ? queue ? c.bubbles.waiting : leaving ? c.purchased ? p < .82 ? c.bubbles.purchase : c.bubbles.service : c.abandons ? c.bubbles.abandon : undefined : c.defection ? c.bubbles.reason : undefined : undefined;
            Object.values(c.bubbles).forEach((sprite) => { sprite.visible = sprite === shown; if (sprite.visible) { sprite.position.copy(c.pose.position); sprite.position.y += 1.12; } });
          }
        });
        departures.forEach((d) => {
          const p = stress ? (((now - d.start) % d.duration + d.duration) % d.duration) / d.duration : (now - d.start) / d.duration;
          d.pose.visible = live && p >= 0 && p < 1; d.pose.heading = samplePath(d.path, reducedMotion ? .1 : p, d.pose.position); d.pose.animation = "frustrated";
        });
        traffic.update(trafficElapsed, crowd.poses);
        const arguing = traffic.arguingDriver();
        if (arguing && live) {
          if (driverCaption.textContent !== arguing.text) driverCaption.textContent = arguing.text;
          const anchor = arguing.car.localToWorld(new THREE.Vector3(0, 1.15, 0)).project(camera);
          driverCaption.hidden = anchor.z >= 1 || anchor.z <= -1;
          driverCaption.style.left = `${THREE.MathUtils.clamp((anchor.x + 1) * .5 * mount.clientWidth, 85, mount.clientWidth - 85)}px`;
          driverCaption.style.top = `${THREE.MathUtils.clamp((1 - anchor.y) * .5 * mount.clientHeight, 108, mount.clientHeight - 90)}px`;
        } else driverCaption.hidden = true;
        crowd.update(live ? dt : 0, reducedMotion);
        try { postprocessing.render(); } catch (error) { renderError = true; console.error("District render failed", error); setFailed(true); return; }
        if (qaEnabled) {
          const visible = crowd.poses.filter((p) => p.visible);
          const clipped = visible.filter((p) => layout.entries.some((entry) => intersectsStorefront({ x: p.position.x, z: p.position.z }, entry))).length;
          metrics?.record(timestamp, { calls: renderer.info.render.drawCalls, triangles: renderer.info.render.triangles, npcCount: visible.length, clipped, animations: visible.map((p) => p.animation), storm: event === "rain", tier: stress ? 3 : Math.max(...active.map(playerTier)), dpr: renderer.getPixelRatio() });
        }
        frame = requestAnimationFrame(render);
      };
      let disposed = false;
      cleanup = () => { if (disposed) return; disposed = true; cancelAnimationFrame(frame); observer.disconnect(); renderer.domElement.removeEventListener("pointerup", onPointerUp); driverCaption.remove(); crowd.group.removeFromParent(); crowd.dispose(); traffic.dispose(); postprocessing.dispose(); atmosphere.dispose(); disposePlaza(scene); assets.dispose(); if (runtimeRef.current === runtime) runtimeRef.current = undefined; if (postRef.current === postprocessing) postRef.current = undefined; };
      try {
        await postprocessing.compileAsync();
        if (!cancelled) {
          atmosphere.update(0, phaseRef.current.phase, 0, reducedMotion);
          postprocessing.setFocusDistance(camera.position.distanceTo(initial.target));
          postprocessing.render(); // Warm the post stack before the timed animation loop.
        }
      } catch (error) { console.error("District shader compilation failed", error); if (!cancelled) { setFailed(true); setLoading(false); } cleanup(); return; }
      if (cancelled) { cleanup(); return; }
      started = performance.now(); last = started;
      setLoading(false); frame = requestAnimationFrame(render);
    };
    setupChainRef.current = setupChainRef.current.catch(() => undefined).then(() => cancelled ? undefined : initialize()).catch((error) => { console.error("District setup failed", error); if (!cancelled) { setFailed(true); setLoading(false); } cleanup?.(); });
    return () => { cancelled = true; cleanup?.(); };
  }, [key]);

  useEffect(() => () => {
    const renderer = rendererRef.current;
    rendererRef.current = undefined; rendererReadyRef.current = undefined;
    void setupChainRef.current.finally(() => { renderer?.dispose(); renderer?.domElement.remove(); });
  }, []);

  const phaseLabel = phase === "decisions" ? "DISTRICT PAUSED · PLAN YOUR WEEK" : phase === "operations" ? "THE DISTRICT IS OPEN" : phase === "results" ? "SUNSET · BOOKS CLOSED" : "LIVING DISTRICT";
  return <figure className={`tycoon-world tycoon-world--plaza ${compact ? "tycoon-world--compact" : ""}`} aria-label={`Living District, week ${day}. Cars stop when pegs use crosswalks; angry driver speech bubbles are visual only. Animated people, some walking dogs or cats, and valuation-based storefronts. Green peg badges mean satisfied service, yellow means mixed, and red means disappointed.`}>
    <div className="tycoon-world__copy"><span>{phaseLabel}</span><strong>{active.length} ventures. One living city.</strong></div>
    <div className="world-controls" aria-label="Plaza view and sound controls"><button onClick={() => { setOverview(true); setZoom(0); }} aria-label="Show plaza overview">⌂</button>{myPlayerId && <button onClick={() => selectionRef.current(myPlayerId)} aria-label="Focus my storefront">◎</button>}<button onClick={() => setZoom((z) => (z + 1) % 3)} aria-label="Cycle plaza zoom">＋</button><button className={soundEnabled ? "sound-toggle active" : "sound-toggle"} onClick={() => void toggleSound()} aria-label={soundEnabled ? "Mute district sound" : "Enable district sound"} aria-pressed={soundEnabled} title={soundEnabled ? "Mute district sound" : "Enable district sound"} disabled={typeof window.AudioContext === "undefined"}>{soundEnabled ? "🔊" : "🔇"}</button></div>
    <div className="tycoon-world__canvas" ref={mountRef}>{(failed || loading) && <div className="world-fallback" role="status">{failed ? "3D view unavailable. All decisions and financials remain available below." : "Opening the district…"}</div>}</div>
    <span className={`weather-chip weather-chip--${event}`}>{EVENT_LABEL[event]}</span>
    {(phase === "operations" || qaMode !== "live") && <figcaption className="world-legend world-service-legend" aria-label="Customer service reaction key"><span><i className="service-dot service-dot--happy" /> Satisfied</span><span><i className="service-dot service-dot--mixed" /> Mixed</span><span><i className="service-dot service-dot--unhappy" /> Disappointed</span></figcaption>}
    <div className="world-business-tabs" aria-label="Inspect a storefront">{active.map((p, i) => <button key={p.id} onClick={() => selectionRef.current(p.id)} className={!overview && selectedId === p.id ? "active" : ""}><i style={{ background: `#${PLAYER_COLORS[i % PLAYER_COLORS.length]!.toString(16)}` }} /><span>{getVenture(p.ventureId ?? "")?.emoji} {p.nickname}</span><small>{TIER_LABELS[playerTier(p)]} · {publicSignals.find((s) => s.playerId === p.id)?.visibleCapacity ?? "—"} capacity</small></button>)}</div>
    {qaEnabled && <aside className="graphics-qa" aria-label="Graphics diagnostics"><label>Render test<select aria-label="Render test" value={qaMode} onChange={(e) => setQaMode(e.target.value as typeof qaMode)}><option value="live">Live match</option><option value="clear">80 NPCs · tier 3 · clear</option><option value="storm">80 NPCs · tier 3 · storm</option></select></label><label>Contact shadow strength: {Math.round(aoIntensity * 100)}%<input type="range" min="0" max="1" step="0.05" value={aoIntensity} onChange={(e) => setAoIntensity(Number(e.target.value))} aria-label="Contact shadow strength" /></label><output ref={metricsRef} data-testid="graphics-metrics">Collecting render samples…</output><small>Visual stress fixture only. Match finances are unaffected.</small></aside>}
  </figure>;
}
