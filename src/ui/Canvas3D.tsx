import { useEffect, useRef, useState, type ReactNode } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BUILDING_BY_ID, item } from '../data';
import { addLink, moveMachine, outputPorts, placeMachine, signOffer, triggerCraft } from '../engine/factory';
import { useContent } from '../i18n/useLang';
import { machineIds, selectMachines, type Pending, type Selection } from './Canvas';
import type { Game } from './useGame';
import { craftProgress } from './geometry';
import { statusLabel } from '../engine/simulate';
import './canvas3d.css';
import { createBuildingModel, footprints, contractFloors } from './building3d';
import { money } from './format';

interface Props {
  game: Game;
  selection: Selection;
  setSelection: (s: Selection) => void;
  pending: Pending | null;
  setPending: (p: Pending | null) => void;
  onOpenBuild?: () => void;
  children?: ReactNode;
}

const SCALE = 100;
const dispose = (root: THREE.Object3D) => root.traverse((obj) => {
  const mesh = obj as THREE.Mesh;
  mesh.geometry?.dispose();
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  materials.forEach((m) => { if (m) { (m as THREE.MeshBasicMaterial).map?.dispose(); m.dispose(); } });
});

export default function Canvas3D(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const { bName, iName } = useContent();
  const names = useRef(bName);
  names.current = bName;
  const [error, setError] = useState(false);
  const [wiring, setWiring] = useState<{ fromId: string; itemId: string } | null>(null);
  const wireRef = useRef(wiring);
  wireRef.current = wiring;
  const resetView = useRef<() => void>(() => {});
  const selected = machineIds(props.selection).map((id) => props.game.state.machines[id]).filter(Boolean);

  useEffect(() => {
    const el = host.current!;
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true }); }
    catch { setError(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    // three.js cannot read the CSS variables, so the Nebula values are
    // literal here. They mirror --bg and the canvas dot grid in index.css.
    scene.background = new THREE.Color('#08070f');
    scene.fog = new THREE.Fog('#08070f', 35, 100);
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.maxPolarAngle = Math.PI / 2.15;
    controls.minDistance = 3;
    controls.maxDistance = 70;
    const fit = () => {
      const machines = Object.values(latest.current.game.state.machines);
      const box = new THREE.Box3();
      machines.forEach(m => box.expandByPoint(new THREE.Vector3(m.x / SCALE, 0, m.y / SCALE)));
      const center = machines.length ? box.getCenter(new THREE.Vector3()) : new THREE.Vector3(3, 0, 2);
      const size = machines.length ? Math.max(10, box.getSize(new THREE.Vector3()).length()) : 12;
      controls.target.copy(center);
      camera.position.copy(center).add(new THREE.Vector3(size * .65, size, size * .9));
      controls.update();
    };
    resetView.current = fit;
    fit();
    // Violet sky, deeper violet bounce, and a warm magenta key light: the
    // nebula gradient turned into lighting rather than paint.
    scene.add(new THREE.HemisphereLight(0xc9c3fa, 0x241f3a, 2.5));
    const sun = new THREE.DirectionalLight(0xffe0f2, 3);
    sun.position.set(8, 18, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25 });
    scene.add(sun);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#151125', roughness: .95 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -.06;
    floor.receiveShadow = true;
    scene.add(floor, new THREE.GridHelper(200, 200, '#3b3168', '#241d3f'));
    const buildings = new THREE.Group();
    const belts = new THREE.Group();
    scene.add(buildings, belts);
    const nodes = new Map<string, { root: THREE.Group; light: THREE.MeshStandardMaterial; ring: THREE.Mesh; label: string; floors: number; updateProgress: (percent: number, status: string) => void }>();
    const vehicles: { truck: THREE.Group; curve: THREE.CatmullRomCurve3; fromId: string; distance: number; phase: number }[] = [];
    const boxMesh = (w: number, h: number, d: number, color: string) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: .5, metalness: .25 }));
      m.castShadow = true; m.receiveShadow = true;
      return m;
    };
    const label = (text: string) => {
      const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 144;
      const ctx = canvas.getContext('2d')!;
      const map = new THREE.CanvasTexture(canvas);
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map, depthTest: false, depthWrite: false }));
      sprite.scale.set(2.8, .79, 1); sprite.position.y = 2.6;
      let previous = '';
      const updateProgress = (percent: number, status: string) => {
        const key = `${percent}:${status}`;
        if (key === previous) return;
        previous = key;
        ctx.clearRect(0, 0, 512, 144);
        ctx.fillStyle = '#101c2cf2'; ctx.beginPath(); ctx.roundRect(0, 0, 512, 144, 16); ctx.fill();
        ctx.font = 'bold 26px sans-serif'; ctx.fillStyle = '#e6f1ff'; ctx.textAlign = 'center'; ctx.fillText(text, 256, 38, 480);
        ctx.font = '22px sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = '#adc5d8'; ctx.fillText(status, 22, 77, 370);
        ctx.textAlign = 'right'; ctx.fillStyle = '#e6f1ff'; ctx.fillText(`${percent}%`, 490, 77);
        ctx.fillStyle = '#304456'; ctx.fillRect(22, 101, 468, 16);
        ctx.fillStyle = status.startsWith('Running') ? '#6becc2' : '#ffc76a'; ctx.fillRect(22, 101, 468 * percent / 100, 16);
        map.needsUpdate = true;
      };
      return { sprite, updateProgress };
    };
    // A flat ribbon follows the route on the floor; separate ribbons form curbs.
    const roadRibbon = (curve: THREE.CatmullRomCurve3, width: number, y: number, color: string) => {
      const vertices: number[] = [], indices: number[] = [];
      for (let i = 0; i <= 64; i++) {
        const t = i / 64, p = curve.getPointAt(t), tangent = curve.getTangentAt(t);
        const side = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(width / 2);
        vertices.push(p.x + side.x, y, p.z + side.z, p.x - side.x, y, p.z - side.z);
        if (i < 64) { const j = i * 2; indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
      const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .95, side: THREE.DoubleSide }));
      mesh.receiveShadow = true; return mesh;
    };
    let linkKey = '';
    const ray = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const cast = (e: PointerEvent) => {
      const r = renderer.domElement.getBoundingClientRect();
      pointer.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
      ray.setFromCamera(pointer, camera);
    };
    const hitId = () => {
      let obj: THREE.Object3D | undefined = ray.intersectObjects(buildings.children, true)[0]?.object;
      while (obj && !obj.userData.machineId) obj = obj.parent ?? undefined;
      return obj?.userData.machineId as string | undefined;
    };
    let down: { x: number; y: number; id?: string; origin?: THREE.Vector3; mx?: number; my?: number } | null = null;
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      cast(e);
      const id = hitId();
      const m = id ? latest.current.game.state.machines[id] : null;
      down = { x: e.clientX, y: e.clientY, id };
      if (e.shiftKey && m) {
        down.origin = ray.ray.intersectPlane(plane, new THREE.Vector3()) ?? undefined;
        down.mx = m.x; down.my = m.y;
        controls.enabled = false;
        renderer.domElement.setPointerCapture(e.pointerId);
      }
    };
    const onMove = (e: PointerEvent) => {
      if (!down?.origin || !down.id) return;
      cast(e);
      const p = ray.ray.intersectPlane(plane, new THREE.Vector3());
      if (p) latest.current.game.act(s => moveMachine(s, down!.id!, Math.round(down!.mx! + (p.x - down!.origin!.x) * SCALE), Math.round(down!.my! + (p.z - down!.origin!.z) * SCALE)));
    };
    const onUp = (e: PointerEvent) => {
      controls.enabled = true;
      const start = down; down = null;
      if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) return;
      cast(e);
      const p = latest.current;
      const id = hitId();
      if (wireRef.current && id) {
        const w = wireRef.current;
        const result = p.game.act(s => addLink(s, w.fromId, w.itemId, id));
        if (!result.ok) p.game.toast(result.reason, 'bad');
        else setWiring(null);
      } else if (p.pending) {
        const at = ray.ray.intersectPlane(plane, new THREE.Vector3());
        if (!at) return;
        const pending = p.pending;
        const result = p.game.act(s => pending.offerId ? signOffer(s, pending.offerId, Math.round(at.x * SCALE), Math.round(at.z * SCALE)) : placeMachine(s, pending.buildingId, Math.round(at.x * SCALE), Math.round(at.z * SCALE)));
        if (!result.ok) p.game.toast(result.reason, 'bad');
        else if (result.id) p.setSelection(selectMachines([result.id]));
        if (pending.offerId || !e.shiftKey) p.setPending(null);
      } else {
        const belt = ray.intersectObjects(belts.children).find(hit => hit.object.userData.linkId)?.object;
        p.setSelection(id ? selectMachines([id]) : belt ? { kind: 'link', id: belt.userData.linkId } : null);
      }
    };
    const onCancel = () => { down = null; controls.enabled = true; };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setWiring(null); };
    renderer.domElement.addEventListener('pointerdown', onDown, true);
    renderer.domElement.addEventListener('pointermove', onMove);
    renderer.domElement.addEventListener('pointerup', onUp);
    renderer.domElement.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    const resize = new ResizeObserver(() => {
      const w = el.clientWidth, h = el.clientHeight;
      renderer.setSize(w, h); camera.aspect = w / Math.max(1, h); camera.updateProjectionMatrix();
    });
    resize.observe(el);
    renderer.setAnimationLoop((time) => {
      const { game, selection } = latest.current;
      const state = game.state;
      const selectedIds = machineIds(selection);
      for (const [id, node] of nodes) if (!state.machines[id] || node.label !== names.current(BUILDING_BY_ID[state.machines[id].buildingId]) || node.floors !== (BUILDING_BY_ID[state.machines[id].buildingId].kind === 'contract' ? contractFloors(state.machines[id].revenueEarned ?? 0) : 0)) {
        buildings.remove(node.root); dispose(node.root); nodes.delete(id);
      }
      for (const m of Object.values(state.machines)) {
        let node = nodes.get(m.id);
        if (!node) {
          const b = BUILDING_BY_ID[m.buildingId];
          const floors = b.kind === 'contract' ? contractFloors(m.revenueEarned ?? 0) : 0;
          const { root, light, ring, height } = createBuildingModel(b.kind, b.color, floors);
          root.userData.machineId = m.id;
          const name = names.current(BUILDING_BY_ID[m.buildingId]);
          const badge = label(name); badge.sprite.position.y = height + 1.25; root.add(badge.sprite);
          node = { root, light, ring, label: name, floors, updateProgress: badge.updateProgress }; nodes.set(m.id, node); buildings.add(root);
        }
        node.root.position.set(m.x / SCALE, 0, m.y / SCALE);
        node.ring.visible = selectedIds.includes(m.id);
        node.updateProgress(Math.floor(craftProgress(m) * 100), statusLabel[state.status[m.id] ?? 'idle'] + (BUILDING_BY_ID[m.buildingId].kind === 'contract' ? ' · ' + money(m.revenueEarned ?? 0) + ' earned' : ''));
        const running = state.status[m.id] === 'running';
        const color = running ? '#60ffbf' : m.enabled ? '#ffc76a' : '#56677c';
        node.light.color.set(color); node.light.emissive.set(color);
        node.light.emissiveIntensity = running ? .7 + Math.sin(time / 250) * .3 : .15;
      }
      const key = JSON.stringify([Object.values(state.links), Object.values(state.machines).map(m => [m.id, m.x, m.y])]);
      if (key !== linkKey) {
        linkKey = key; dispose(belts); belts.clear(); vehicles.length = 0;
        for (const l of Object.values(state.links)) {
          const a = state.machines[l.fromId], b = state.machines[l.toId]; if (!a || !b) continue;
          const from = new THREE.Vector3(a.x / SCALE + footprints[BUILDING_BY_ID[a.buildingId].kind].width / 2, .07, a.y / SCALE);
          const to = new THREE.Vector3(b.x / SCALE - footprints[BUILDING_BY_ID[b.buildingId].kind].width / 2, .07, b.y / SCALE);
          const curve = new THREE.CatmullRomCurve3([from, from.clone().add(new THREE.Vector3(.5, 0, 0)), to.clone().add(new THREE.Vector3(-.5, 0, 0)), to]);
          const color = item(l.itemId).color;
          const curb = roadRibbon(curve, .76, .045, '#89949e'); curb.userData.linkId = l.id; belts.add(curb);
          const road = roadRibbon(curve, .64, .055, '#26313b'); road.userData.linkId = l.id; belts.add(road);
          const distance = Math.max(.01, curve.getLength());
          for (let d = .2; d < distance; d += .5) {
            const t = d / distance, p = curve.getPointAt(t), tangent = curve.getTangentAt(t);
            const dash = boxMesh(.035, .008, .2, '#e7dbae'); dash.position.copy(p); dash.position.y = .065;
            dash.rotation.y = Math.atan2(tangent.x, tangent.z); dash.userData.linkId = l.id; belts.add(dash);
          }
          for (let i = 0; i < Math.min(5, Math.max(1, Math.floor(distance / 2))); i++) {
            const truck = new THREE.Group();
            const chassis = boxMesh(.22, .07, .42, '#17212a'); chassis.position.y = .12; truck.add(chassis);
            const cargo = boxMesh(.23, .19, .26, color); cargo.position.set(0, .24, -.07); truck.add(cargo);
            const cab = boxMesh(.21, .15, .14, '#edf4f6'); cab.position.set(0, .22, .15); truck.add(cab);
            const glass = boxMesh(.17, .065, .015, '#28617c'); glass.position.set(0, .24, .225); truck.add(glass);
            for (const x of [-.125, .125]) for (const z of [-.13, .14]) {
              const wheel = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, .035, 10), new THREE.MeshStandardMaterial({ color: '#0b1118' }));
              wheel.rotation.z = Math.PI / 2; wheel.position.set(x, .105, z); truck.add(wheel);
            }
            truck.traverse(obj => { obj.userData.linkId = l.id; }); belts.add(truck);
            vehicles.push({ truck, curve, fromId: a.id, distance, phase: i * 2 / distance });
          }
        }
      }
      vehicles.forEach(v => {
        v.truck.visible = state.status[v.fromId] === 'running';
        const t = (state.elapsed * .85 / v.distance + v.phase) % 1;
        const p = v.curve.getPointAt(t), tangent = v.curve.getTangentAt(t);
        // Travel on the right lane, from output to input. Simulation time respects pause/speed.
        p.add(new THREE.Vector3(-tangent.z, 0, tangent.x).normalize().multiplyScalar(.16));
        v.truck.position.copy(p); v.truck.position.y = 0;
        v.truck.rotation.y = Math.atan2(tangent.x, tangent.z);
      });
      controls.update(); renderer.render(scene, camera);
    });
    return () => {
      renderer.setAnimationLoop(null); resize.disconnect(); controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', onDown, true);
      renderer.domElement.removeEventListener('pointermove', onMove);
      renderer.domElement.removeEventListener('pointerup', onUp);
      renderer.domElement.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
      dispose(scene); renderer.dispose(); renderer.domElement.remove();
    };
  }, []);

  return <div className="canvas factory-3d">
    <div ref={host} className="three-surface" />
    <div className="floor-heading"><span className="floor-eyebrow">AIfor.study / spatial workspace</span><h2>Your AI factory<span>3D</span></h2><p>Orbit to explore. Build something that works.</p></div>
    <div className="floor-tools"><button onClick={() => resetView.current()}>Fit factory</button></div>
    {error && <div className="floor-empty">3D graphics are unavailable in this browser. Use the 2D editor button to continue.</div>}
    {!error && !props.pending && !Object.keys(props.game.state.machines).length && <div className="floor-empty"><span>01 / BREAK GROUND</span><h3>A company starts with one node.</h3><p>Place your first service on the floor, then connect it to the next.</p><button onClick={props.onOpenBuild}>＋ Build your first service</button></div>}
    {(props.pending || wiring) && <div className="floor-prompt">{props.pending ? `Click the floor to place ${bName(BUILDING_BY_ID[props.pending.buildingId])}` : `Click a destination for ${iName(item(wiring!.itemId))}`}<button onClick={() => { props.setPending(null); setWiring(null); }}>Cancel</button></div>}
    {selected.length === 1 && !props.pending && <div className="floor-connect"><strong>{bName(BUILDING_BY_ID[selected[0].buildingId])}</strong><span>{props.game.state.status[selected[0].id] ?? 'idle'} · Shift + drag to move</span><div>{outputPorts(selected[0]).map(id => <button key={id} onClick={() => setWiring({ fromId: selected[0].id, itemId: id })}>Connect {iName(item(id))} →</button>)}{props.game.state.status[selected[0].id] === 'awaiting' && <button onClick={() => { const result = props.game.act(s => triggerCraft(s, selected[0].id)); if (!result.ok) props.game.toast(result.reason, 'bad'); }}>Generate</button>}</div></div>}
    <div className="floor-help">Drag to orbit <i>·</i> Right-drag to pan <i>·</i> Scroll to zoom <i>·</i> Click to inspect</div>
    {props.children}
    <div className="toasts">{props.game.toasts.map(t => <div key={t.id} className={`toast ${t.tone}`}>{t.text}</div>)}</div>
  </div>;
}


