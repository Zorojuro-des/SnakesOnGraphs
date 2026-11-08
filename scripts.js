(() => {
  "use strict";

  /* ================================================================
     1. Configuration and constants
     ================================================================ */
  const SVG_NS = "http://www.w3.org/2000/svg";
  const STATES = Object.freeze({
    SETUP: "SETUP",
    SELECT_START: "SELECT_START",
    PLACE_APPLE: "PLACE_APPLE",
    SNAKE_MOVE: "SNAKE_MOVE",
    PAUSED: "PAUSED",
    GAME_OVER: "GAME_OVER"
  });
  const DENSITIES = Object.freeze({ sparse: 0.25, medium: 0.55, dense: 0.90 });
  const GRAPH_LABELS = Object.freeze({
    general: "General planar",
    research: "Research challenge",
    theta: "Theta graph"
  });
  const AI_DELAY = 400;
  const $ = (id) => document.getElementById(id);
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const edgeKey = (a, b) => a < b ? `${a}-${b}` : `${b}-${a}`;
  const escapeHTML = (value) => String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);

  function createSeed() {
    if (window.crypto && window.crypto.getRandomValues) {
      const values = new Uint32Array(2);
      window.crypto.getRandomValues(values);
      return `${values[0].toString(36)}-${values[1].toString(36)}`;
    }
    return `${Date.now().toString(36)}-${Math.floor(performance.now() * 1000).toString(36)}`;
  }

  /* ================================================================
     2. Seeded random number generator
     ================================================================ */
  class SeededRandom {
    constructor(seed) {
      this.seed = String(seed);
      let hash = 2166136261;
      for (let i = 0; i < this.seed.length; i += 1) {
        hash ^= this.seed.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      this.state = hash >>> 0;
    }

    next() {
      this.state = (this.state + 0x6D2B79F5) >>> 0;
      let value = this.state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    }

    int(max) {
      return Math.floor(this.next() * max);
    }

    pick(items) {
      return items.length ? items[this.int(items.length)] : null;
    }

    shuffle(items) {
      const result = items.slice();
      for (let i = result.length - 1; i > 0; i -= 1) {
        const j = this.int(i + 1);
        [result[i], result[j]] = [result[j], result[i]];
      }
      return result;
    }

    fork(label) {
      return new SeededRandom(`${this.seed}::${label}`);
    }
  }

  /* ================================================================
     3. Planar Geometry & Graph Generator
     ================================================================ */
  class PlanarGeometry {
    static crossProduct(o, a, b) {
      return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    }

    static pointToSegmentDistance(p, a, b) {
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const lenSq = dx * dx + dy * dy;
      if (lenSq < 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
      const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq, 0, 1);
      const projX = a.x + t * dx;
      const projY = a.y + t * dy;
      return Math.hypot(p.x - projX, p.y - projY);
    }

    static onSegment(a, b, p, eps = 1e-5) {
      return (
        p.x <= Math.max(a.x, b.x) + eps &&
        p.x >= Math.min(a.x, b.x) - eps &&
        p.y <= Math.max(a.y, b.y) + eps &&
        p.y >= Math.min(a.y, b.y) - eps &&
        Math.abs(this.crossProduct(a, b, p)) <= eps
      );
    }

    static segmentsIntersect(a, b, c, d) {
      const d1 = this.crossProduct(c, d, a);
      const d2 = this.crossProduct(c, d, b);
      const d3 = this.crossProduct(a, b, c);
      const d4 = this.crossProduct(a, b, d);
      const eps = 1e-5;
      if (((d1 > eps && d2 < -eps) || (d1 < -eps && d2 > eps)) &&
          ((d3 > eps && d4 < -eps) || (d3 < -eps && d4 > eps))) {
        return true;
      }
      if (Math.abs(d1) <= eps && this.onSegment(c, d, a, eps)) return true;
      if (Math.abs(d2) <= eps && this.onSegment(c, d, b, eps)) return true;
      if (Math.abs(d3) <= eps && this.onSegment(a, b, c, eps)) return true;
      if (Math.abs(d4) <= eps && this.onSegment(a, b, d, eps)) return true;
      return false;
    }

    static canAddPlanarEdge(vertices, existingEdges, u, v, minClearance = 38) {
      if (u === v) return false;
      const a = vertices[u];
      const b = vertices[v];
      for (let i = 0; i < vertices.length; i += 1) {
        if (i === u || i === v) continue;
        if (this.pointToSegmentDistance(vertices[i], a, b) < minClearance) {
          return false;
        }
      }
      for (const edge of existingEdges) {
        if ((edge.a === u && edge.b === v) || (edge.a === v && edge.b === u)) return false;
        const c = vertices[edge.a];
        const d = vertices[edge.b];
        const sharesEndpoint = edge.a === u || edge.a === v || edge.b === u || edge.b === v;
        if (sharesEndpoint) {
          const shared = (edge.a === u || edge.a === v) ? edge.a : edge.b;
          const otherExisting = edge.a === shared ? edge.b : edge.a;
          const otherNew = u === shared ? v : u;
          const pShared = vertices[shared];
          const p1 = vertices[otherExisting];
          const p2 = vertices[otherNew];
          const v1x = p1.x - pShared.x;
          const v1y = p1.y - pShared.y;
          const v2x = p2.x - pShared.x;
          const v2y = p2.y - pShared.y;
          const denom = Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y);
          if (denom > 1e-6) {
            const cosAngle = (v1x * v2x + v1y * v2y) / denom;
            if (cosAngle > 0.965) return false;
          }
        } else if (this.segmentsIntersect(a, b, c, d)) {
          return false;
        }
      }
      return true;
    }

    static isValidPlanarLayout(vertices, edges, minVertexDist = 100, minClearance = 32) {
      const n = vertices.length;
      for (let i = 0; i < n; i += 1) {
        for (let j = i + 1; j < n; j += 1) {
          if (Math.hypot(vertices[i].x - vertices[j].x, vertices[i].y - vertices[j].y) < minVertexDist) {
            return false;
          }
        }
      }
      for (let i = 0; i < edges.length; i += 1) {
        const e1 = edges[i];
        const a = vertices[e1.a];
        const b = vertices[e1.b];
        for (let k = 0; k < n; k += 1) {
          if (k === e1.a || k === e1.b) continue;
          if (this.pointToSegmentDistance(vertices[k], a, b) < minClearance) {
            return false;
          }
        }
        for (let j = i + 1; j < edges.length; j += 1) {
          const e2 = edges[j];
          const sharesEndpoint = e1.a === e2.a || e1.a === e2.b || e1.b === e2.a || e1.b === e2.b;
          if (!sharesEndpoint && this.segmentsIntersect(a, b, vertices[e2.a], vertices[e2.b])) {
            return false;
          }
        }
      }
      return true;
    }
  }

  class GraphGenerator {
    static emptyGraph(vertices, type, metadata = {}) {
      return {
        type,
        vertices: Array.from({ length: vertices }, (_, id) => ({ id, x: 0, y: 0 })),
        adjacency: Array.from({ length: vertices }, () => []),
        edges: [],
        ...metadata
      };
    }

    static cloneGraph(graph) {
      return {
        ...graph,
        vertices: graph.vertices.map((vertex) => ({ ...vertex })),
        adjacency: graph.adjacency.map((neighbors) => neighbors.slice()),
        edges: graph.edges.map((edge) => ({ ...edge })),
        thetaPaths: graph.thetaPaths ? graph.thetaPaths.map((path) => path.slice()) : undefined
      };
    }

    static addEdge(graph, a, b) {
      if (a === b || graph.adjacency[a].includes(b)) return false;
      graph.adjacency[a].push(b);
      graph.adjacency[b].push(a);
      graph.edges.push({ a, b });
      return true;
    }

    static removeEdge(graph, a, b) {
      graph.adjacency[a] = graph.adjacency[a].filter((v) => v !== b);
      graph.adjacency[b] = graph.adjacency[b].filter((v) => v !== a);
      const key = edgeKey(a, b);
      graph.edges = graph.edges.filter((item) => edgeKey(item.a, item.b) !== key);
    }

    static finalize(graph) {
      graph.adjacency.forEach((neighbors) => neighbors.sort((a, b) => a - b));
      graph.edges.sort((edgeA, edgeB) => edgeKey(edgeA.a, edgeA.b).localeCompare(edgeKey(edgeB.a, edgeB.b), undefined, { numeric: true }));
      return graph;
    }

    static validateTheta(p, q, r) {
      const values = [Number(p), Number(q), Number(r)];
      if (!values.every(Number.isInteger) || values.some((value) => value < 1)) {
        return { valid: false, total: NaN, message: "Each path length must be a positive integer." };
      }
      const total = values[0] + values[1] + values[2] - 1;
      if (total < 6 || total > 16) {
        return { valid: false, total, message: `Total vertices must be between 6 and 16; currently ${total}.` };
      }
      if (values.filter((value) => value === 1).length > 1) {
        return { valid: false, total, message: "At most one path may have length 1." };
      }
      return { valid: true, total, message: "Three paths share only their endpoints." };
    }

    static generateSpacedVertices(n, rng) {
      const minSep = Math.max(122, 182 - n * 3.6);
      const marginX = 76;
      const marginY = 72;
      const width = 800 - marginX * 2;
      const height = 600 - marginY * 2;
      const cols = Math.ceil(Math.sqrt((n * width) / height));
      const rows = Math.ceil(n / cols);
      const cellW = width / cols;
      const cellH = height / rows;

      const cells = [];
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          cells.push({ r, c });
        }
      }
      const chosenCells = rng.shuffle(cells).slice(0, n);
      const pts = chosenCells.map(({ r, c }) => ({
        x: marginX + (c + 0.22 + rng.next() * 0.56) * cellW,
        y: marginY + (r + 0.22 + rng.next() * 0.56) * cellH
      }));

      for (let iter = 0; iter < 220; iter += 1) {
        for (let i = 0; i < n; i += 1) {
          let fx = 0;
          let fy = 0;
          for (let j = 0; j < n; j += 1) {
            if (i === j) continue;
            let dx = pts[i].x - pts[j].x;
            let dy = pts[i].y - pts[j].y;
            let dist = Math.hypot(dx, dy);
            if (dist < 1) {
              dx = rng.next() - 0.5;
              dy = rng.next() - 0.5;
              dist = Math.hypot(dx, dy) + 0.1;
            }
            if (dist < minSep * 1.35) {
              const push = ((minSep * 1.35 - dist) / (minSep * 1.35)) * 14;
              fx += (dx / dist) * push;
              fy += (dy / dist) * push;
            }
          }
          fx += (400 - pts[i].x) * 0.018;
          fy += (300 - pts[i].y) * 0.018;
          pts[i].x = clamp(pts[i].x + fx, marginX, 800 - marginX);
          pts[i].y = clamp(pts[i].y + fy, marginY, 600 - marginY);
        }

        for (let i = 0; i < n; i += 1) {
          for (let j = i + 1; j < n; j += 1) {
            const dx = pts[j].x - pts[i].x;
            const dy = pts[j].y - pts[i].y;
            const dist = Math.max(0.1, Math.hypot(dx, dy));
            if (dist < minSep) {
              const push = (minSep - dist) * 0.52;
              const px = (dx / dist) * push;
              const py = (dy / dist) * push;
              pts[i].x = clamp(pts[i].x - px, marginX, 800 - marginX);
              pts[i].y = clamp(pts[i].y - py, marginY, 600 - marginY);
              pts[j].x = clamp(pts[j].x + px, marginX, 800 - marginX);
              pts[j].y = clamp(pts[j].y + py, marginY, 600 - marginY);
            }
          }
        }
      }

      return pts;
    }

    static general(vertices, density, rng) {
      const n = Number(vertices);
      if (!Number.isInteger(n) || n < 6 || n > 16) throw new Error("Vertex count must be an integer from 6 to 16.");
      if (!Object.hasOwn(DENSITIES, density)) throw new Error("Unknown graph density.");

      const graph = this.emptyGraph(n, "general", { density });
      const pts = this.generateSpacedVertices(n, rng);
      const labels = rng.shuffle(Array.from({ length: n }, (_, index) => index));
      labels.forEach((vertexId, idx) => {
        graph.vertices[vertexId].x = pts[idx].x;
        graph.vertices[vertexId].y = pts[idx].y;
      });

      const allPairs = [];
      for (let a = 0; a < n; a += 1) {
        for (let b = a + 1; b < n; b += 1) {
          const dist = Math.hypot(
            graph.vertices[a].x - graph.vertices[b].x,
            graph.vertices[a].y - graph.vertices[b].y
          );
          allPairs.push({ a, b, dist, score: dist * (0.92 + rng.next() * 0.16) });
        }
      }
      allPairs.sort((p1, p2) => p1.score - p2.score);

      // 1. Build a crossing-free planar spanning tree (Kruskal on shortest valid planar edges)
      const parent = Array.from({ length: n }, (_, i) => i);
      const find = (x) => {
        let root = x;
        while (parent[root] !== root) root = parent[root];
        let curr = x;
        while (curr !== root) {
          const nxt = parent[curr];
          parent[curr] = root;
          curr = nxt;
        }
        return root;
      };
      const union = (a, b) => {
        const ra = find(a);
        const rb = find(b);
        if (ra === rb) return false;
        parent[ra] = rb;
        return true;
      };

      for (const pair of allPairs) {
        if (find(pair.a) !== find(pair.b)) {
          if (PlanarGeometry.canAddPlanarEdge(graph.vertices, graph.edges, pair.a, pair.b, 38)) {
            this.addEdge(graph, pair.a, pair.b);
            union(pair.a, pair.b);
          }
        }
      }

      // Fallback with relaxed clearance if any component remained separated
      for (const pair of allPairs) {
        if (find(pair.a) !== find(pair.b)) {
          if (PlanarGeometry.canAddPlanarEdge(graph.vertices, graph.edges, pair.a, pair.b, 26)) {
            this.addEdge(graph, pair.a, pair.b);
            union(pair.a, pair.b);
          }
        }
      }

      // 2. Collect all remaining non-crossing planar triangulation chords
      const extraPlanarCandidates = [];
      for (const pair of allPairs) {
        if (!graph.adjacency[pair.a].includes(pair.b)) {
          extraPlanarCandidates.push(pair);
        }
      }

      const maximalPlanarPool = [];
      const tempEdges = graph.edges.map((e) => ({ ...e }));
      for (const pair of extraPlanarCandidates) {
        if (PlanarGeometry.canAddPlanarEdge(graph.vertices, tempEdges, pair.a, pair.b, 38)) {
          tempEdges.push({ a: pair.a, b: pair.b });
          maximalPlanarPool.push(pair);
        }
      }

      const targetExtraCount = Math.max(
        1,
        Math.round(maximalPlanarPool.length * DENSITIES[density])
      );
      const chosenExtras = rng.shuffle(maximalPlanarPool).slice(0, targetExtraCount);
      for (const edge of chosenExtras) {
        if (PlanarGeometry.canAddPlanarEdge(graph.vertices, graph.edges, edge.a, edge.b, 36)) {
          this.addEdge(graph, edge.a, edge.b);
        }
      }

      return this.relaxPlanarLayout(this.finalize(graph), rng.fork("relax"));
    }

    static research(vertices, rng) {
      const n = Number(vertices);
      if (!Number.isInteger(n) || n < 6 || n > 16) throw new Error("Vertex count must be an integer from 6 to 16.");

      // Construct planar base graph:
      // Outer cycle: 1 - 2 - ... - (n-2) - 0 - 1 (n-1 vertices)
      // Interior vertex: (n-1) connected to 1 and (n-2).
      // This is isomorphic to Theta(2, 2, n-3): planar, 2-connected, has Hamiltonian path, no Hamiltonian cycle.
      const labels = rng.shuffle(Array.from({ length: n }, (_, index) => index));
      const graph = this.emptyGraph(n, "research");

      const cycleOrder = [];
      for (let i = 1; i <= n - 2; i += 1) cycleOrder.push(labels[i]);
      cycleOrder.push(labels[0]); // labels[0] sits between labels[n-2] and labels[1]
      const innerVertex = labels[n - 1];

      const angleOffset = rng.next() * Math.PI * 2;
      const m = cycleOrder.length; // n - 1
      cycleOrder.forEach((vId, idx) => {
        const theta = angleOffset + (idx / m) * Math.PI * 2;
        const isOuterCap = vId === labels[0];
        const rx = isOuterCap ? 315 : 285;
        const ry = isOuterCap ? 228 : 208;
        graph.vertices[vId].x = clamp(400 + rx * Math.cos(theta), 68, 732);
        graph.vertices[vId].y = clamp(300 + ry * Math.sin(theta), 66, 534);
      });

      // Place innerVertex inside the polygon, slightly toward the bisector of labels[1] and labels[n-2]
      const capAngle = angleOffset + ((m - 1) / m) * Math.PI * 2;
      graph.vertices[innerVertex].x = clamp(400 + 55 * Math.cos(capAngle), 260, 540);
      graph.vertices[innerVertex].y = clamp(300 + 42 * Math.sin(capAngle), 200, 400);

      for (let i = 0; i < n - 1; i += 1) this.addEdge(graph, labels[i], labels[i + 1]);
      this.addEdge(graph, labels[0], labels[n - 2]);
      this.addEdge(graph, labels[1], labels[n - 1]);
      this.finalize(graph);

      // Gather candidate planar chords sorted by distance so short, natural planar chords are tried first
      const candidates = [];
      for (let a = 0; a < n; a += 1) {
        for (let b = a + 1; b < n; b += 1) {
          if (!graph.adjacency[a].includes(b)) {
            const dist = Math.hypot(
              graph.vertices[a].x - graph.vertices[b].x,
              graph.vertices[a].y - graph.vertices[b].y
            );
            candidates.push({ a, b, score: dist * (0.9 + rng.next() * 0.2) });
          }
        }
      }
      candidates.sort((c1, c2) => c1.score - c2.score);

      for (const edge of candidates) {
        if (!PlanarGeometry.canAddPlanarEdge(graph.vertices, graph.edges, edge.a, edge.b, 38)) {
          continue;
        }
        this.addEdge(graph, edge.a, edge.b);
        if (GraphAnalyzer.hasHamiltonianCycle(graph)) {
          this.removeEdge(graph, edge.a, edge.b);
        }
      }

      this.finalize(graph);
      const valid = GraphAnalyzer.isConnected(graph)
        && GraphAnalyzer.isTwoVertexConnected(graph)
        && GraphAnalyzer.hasHamiltonianPath(graph)
        && !GraphAnalyzer.hasHamiltonianCycle(graph);
      if (!valid) throw new Error("Unable to generate a verified planar Research Challenge graph.");

      return this.relaxPlanarLayout(graph, rng.fork("layout"));
    }

    static theta(p, q, r, rng) {
      const validation = this.validateTheta(p, q, r);
      if (!validation.valid) throw new Error(validation.message);
      const lengths = [Number(p), Number(q), Number(r)];
      const graph = this.emptyGraph(validation.total, "theta", {
        thetaParameters: { p: lengths[0], q: lengths[1], r: lengths[2] },
        thetaPaths: []
      });
      let nextVertex = 2;
      for (const length of lengths) {
        const path = [0];
        for (let i = 1; i < length; i += 1) path.push(nextVertex++);
        path.push(1);
        graph.thetaPaths.push(path);
        for (let i = 0; i < path.length - 1; i += 1) this.addEdge(graph, path[i], path[i + 1]);
      }
      const permuted = this.permuteGraph(this.finalize(graph), rng);
      if (!this.hasThreeInternallyDisjointPaths(permuted)) throw new Error("Theta path verification failed.");
      return this.thetaLayout(permuted);
    }

    static hasThreeInternallyDisjointPaths(graph) {
      if (!graph.thetaPaths || graph.thetaPaths.length !== 3) return false;
      const internal = new Set();
      for (const path of graph.thetaPaths) {
        if (path.length < 2 || path[0] === path[path.length - 1]) return false;
        for (let i = 1; i < path.length - 1; i += 1) {
          if (internal.has(path[i])) return false;
          internal.add(path[i]);
        }
        for (let i = 0; i < path.length - 1; i += 1) {
          if (!graph.adjacency[path[i]].includes(path[i + 1])) return false;
        }
      }
      const endpoints = graph.thetaPaths.map((path) => [path[0], path[path.length - 1]]);
      return endpoints.every((pair) => pair[0] === endpoints[0][0] && pair[1] === endpoints[0][1]);
    }

    static permuteGraph(graph, rng) {
      const n = graph.vertices.length;
      const labels = rng.shuffle(Array.from({ length: n }, (_, index) => index));
      const result = this.emptyGraph(n, graph.type, {
        density: graph.density,
        thetaParameters: graph.thetaParameters,
        thetaPaths: graph.thetaPaths ? graph.thetaPaths.map((path) => path.map((vertex) => labels[vertex])) : undefined
      });
      for (const edge of graph.edges) this.addEdge(result, labels[edge.a], labels[edge.b]);
      return this.finalize(result);
    }

    static relaxPlanarLayout(graph) {
      const n = graph.vertices.length;
      const minSep = Math.max(115, 172 - n * 3.4);
      const minClearance = 36;
      const idealEdgeLen = Math.max(135, 200 - n * 3.5);

      for (let iter = 0; iter < 90; iter += 1) {
        const cooling = 1 - iter / 110;
        for (let i = 0; i < n; i += 1) {
          let fx = 0;
          let fy = 0;
          for (let j = 0; j < n; j += 1) {
            if (i === j) continue;
            const dx = graph.vertices[i].x - graph.vertices[j].x;
            const dy = graph.vertices[i].y - graph.vertices[j].y;
            const distSq = Math.max(25, dx * dx + dy * dy);
            const dist = Math.sqrt(distSq);
            const repulse = 12000 / distSq;
            fx += (dx / dist) * repulse;
            fy += (dy / dist) * repulse;
          }
          for (const neighbor of graph.adjacency[i]) {
            const dx = graph.vertices[neighbor].x - graph.vertices[i].x;
            const dy = graph.vertices[neighbor].y - graph.vertices[i].y;
            const dist = Math.max(1, Math.hypot(dx, dy));
            const spring = (dist - idealEdgeLen) * 0.025;
            fx += (dx / dist) * spring;
            fy += (dy / dist) * spring;
          }
          fx += (400 - graph.vertices[i].x) * 0.012;
          fy += (300 - graph.vertices[i].y) * 0.012;

          const stepX = clamp(fx * cooling * 0.45, -12, 12);
          const stepY = clamp(fy * cooling * 0.45, -12, 12);
          const oldX = graph.vertices[i].x;
          const oldY = graph.vertices[i].y;
          graph.vertices[i].x = clamp(oldX + stepX, 68, 732);
          graph.vertices[i].y = clamp(oldY + stepY, 66, 534);

          if (!PlanarGeometry.isValidPlanarLayout(graph.vertices, graph.edges, minSep, minClearance)) {
            graph.vertices[i].x = oldX;
            graph.vertices[i].y = oldY;
          }
        }
      }
      return graph;
    }

    static thetaLayout(graph) {
      const paths = graph.thetaPaths.map((path) => path.slice());
      // Place the shortest path in the middle (index 1) so longer paths enjoy the wide upper/lower arches
      paths.sort((a, b) => a.length - b.length);
      [paths[0], paths[1]] = [paths[1], paths[0]];

      const startX = 80;
      const endX = 720;
      const spanX = endX - startX;
      const centerY = 300;
      const offsets = [-210, 0, 210];

      paths.forEach((path, pathIndex) => {
        const length = path.length - 1;
        for (let i = 1; i < path.length - 1; i += 1) {
          const t = i / length;
          const vertex = graph.vertices[path[i]];
          vertex.x = startX + spanX * t;
          vertex.y = centerY + offsets[pathIndex] * Math.sin(Math.PI * t);
        }
      });
      graph.vertices[paths[0][0]].x = startX;
      graph.vertices[paths[0][0]].y = centerY;
      graph.vertices[paths[0][paths[0].length - 1]].x = endX;
      graph.vertices[paths[0][paths[0].length - 1]].y = centerY;
      return graph;
    }
  }

  /* ================================================================
     4. Graph analyzer
     ================================================================ */
  class GraphAnalyzer {
    static edgeCount(graph) {
      return graph.edges.length;
    }

    static degrees(graph) {
      return graph.adjacency.map((neighbors) => neighbors.length);
    }

    static density(graph) {
      const n = graph.vertices.length;
      return n > 1 ? (2 * this.edgeCount(graph)) / (n * (n - 1)) : 0;
    }

    static isPlanarDrawing(graph) {
      return PlanarGeometry.isValidPlanarLayout(graph.vertices, graph.edges, 40, 12);
    }

    static isConnected(graph) {
      const n = graph.vertices.length;
      if (!n) return false;
      const visited = new Set([0]);
      const queue = [0];
      for (let index = 0; index < queue.length; index += 1) {
        for (const neighbor of graph.adjacency[queue[index]]) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
      return visited.size === n;
    }

    static articulationPoints(graph) {
      const n = graph.vertices.length;
      const discovery = Array(n).fill(-1);
      const low = Array(n).fill(0);
      const parent = Array(n).fill(-1);
      const points = new Set();
      let time = 0;
      const visit = (u) => {
        discovery[u] = low[u] = ++time;
        let children = 0;
        for (const v of graph.adjacency[u]) {
          if (discovery[v] === -1) {
            parent[v] = u;
            children += 1;
            visit(v);
            low[u] = Math.min(low[u], low[v]);
            if (parent[u] === -1 && children > 1) points.add(u);
            if (parent[u] !== -1 && low[v] >= discovery[u]) points.add(u);
          } else if (v !== parent[u]) {
            low[u] = Math.min(low[u], discovery[v]);
          }
        }
      };
      for (let vertex = 0; vertex < n; vertex += 1) if (discovery[vertex] === -1) visit(vertex);
      return Array.from(points).sort((a, b) => a - b);
    }

    static isTwoVertexConnected(graph) {
      return graph.vertices.length >= 3 && this.isConnected(graph) && this.articulationPoints(graph).length === 0;
    }

    static hasHamiltonianPath(graph) {
      const n = graph.vertices.length;
      if (!n) return false;
      if (n === 1) return true;
      const full = (1 << n) - 1;
      const dp = new Uint16Array(1 << n);
      for (let vertex = 0; vertex < n; vertex += 1) dp[1 << vertex] |= 1 << vertex;
      for (let mask = 1; mask <= full; mask += 1) {
        let endpoints = dp[mask];
        while (endpoints) {
          const bit = endpoints & -endpoints;
          const end = 31 - Math.clz32(bit);
          endpoints ^= bit;
          for (const neighbor of graph.adjacency[end]) {
            if ((mask & (1 << neighbor)) === 0) dp[mask | (1 << neighbor)] |= 1 << neighbor;
          }
        }
      }
      return dp[full] !== 0;
    }

    static hasHamiltonianCycle(graph) {
      const n = graph.vertices.length;
      if (n < 3) return false;
      const full = (1 << n) - 1;
      const dp = new Uint16Array(1 << n);
      dp[1] = 1;
      for (let mask = 1; mask <= full; mask += 1) {
        if ((mask & 1) === 0) continue;
        let endpoints = dp[mask];
        while (endpoints) {
          const bit = endpoints & -endpoints;
          const end = 31 - Math.clz32(bit);
          endpoints ^= bit;
          for (const neighbor of graph.adjacency[end]) {
            if ((mask & (1 << neighbor)) === 0) dp[mask | (1 << neighbor)] |= 1 << neighbor;
          }
        }
      }
      let endpoints = dp[full];
      while (endpoints) {
        const bit = endpoints & -endpoints;
        const end = 31 - Math.clz32(bit);
        endpoints ^= bit;
        if (graph.adjacency[end].includes(0)) return true;
      }
      return false;
    }

    static classifyTheta(p, q, r) {
      const lengths = [Number(p), Number(q), Number(r)];
      return lengths.includes(1) || lengths.filter((length) => length === 2).length >= 2;
    }

    static researchObservations(graph) {
      const observations = [];
      const hasCycle = this.hasHamiltonianCycle(graph);
      const hasPath = this.hasHamiltonianPath(graph);
      const degrees = this.degrees(graph);
      if (hasCycle) observations.push({ kind: "winnable", text: "Hamiltonian cycle found: The research classifies this graph as snake-winnable." });
      if (!hasPath) observations.push({ kind: "not-winnable", text: "No Hamiltonian path found: The research classifies this graph as not snake-winnable." });
      if (degrees.some((degree) => degree === 1)) observations.push({ kind: "not-winnable", text: "Vertex of degree 1 found: The research classifies this graph as not snake-winnable." });
      if (graph.type === "theta") {
        const { p, q, r } = graph.thetaParameters;
        const winnable = this.classifyTheta(p, q, r);
        const reason = [p, q, r].includes(1)
          ? "at least one path has length 1"
          : [p, q, r].filter((length) => length === 2).length >= 2
            ? "at least two paths have length 2"
            : "neither sufficient condition is met";
        observations.push({
          kind: winnable ? "winnable" : "not-winnable",
          text: `Theta graph classification: Theorem 4 classifies this graph as ${winnable ? "snake-winnable" : "not snake-winnable"} because ${reason}.`
        });
      }
      if (!observations.length) observations.push({ kind: "neutral", text: "No classification from the implemented research results applies to this graph." });
      return observations;
    }
  }

  /* ================================================================
     5. Game state
     ================================================================ */
  class GameState {
    constructor(config, graph, seed) {
      this.config = { ...config };
      this.graph = graph;
      this.seed = String(seed);
      this.phase = STATES.SELECT_START;
      this.previousPhase = null;
      this.snakeBody = [];
      this.apple = null;
      this.applesEaten = 0;
      this.movesUsed = 0;
      this.totalMoves = 0;
      this.winner = null;
      this.resultReason = "";
      this.history = [];
    }

    get head() {
      return this.snakeBody.length ? this.snakeBody[this.snakeBody.length - 1] : null;
    }

    get tail() {
      return this.snakeBody.length ? this.snakeBody[0] : null;
    }

    get occupied() {
      return new Set(this.snakeBody);
    }

    get maxMoves() {
      return this.graph.vertices.length * 2;
    }
  }

  /* ================================================================
     6. Game engine and explicit state machine
     ================================================================ */
  class GameEngine {
    constructor() {
      this.state = null;
      this.listeners = [];
      this.session = 0;
    }

    subscribe(listener) {
      this.listeners.push(listener);
    }

    notify(event = "update") {
      for (const listener of this.listeners) listener(event, this.state);
    }

    startMatch(config, graph, seed) {
      this.session += 1;
      this.state = new GameState(config, graph, seed);
      this.addHistory("graph", "Graph generated", `${graph.vertices.length} vertices · Seed ${seed}`);
      this.notify("start");
      return this.state;
    }

    addHistory(type, title, detail = "") {
      if (!this.state) return;
      this.state.history.push({ type, title, detail, number: this.state.history.length + 1 });
    }

    activeRole() {
      if (!this.state) return null;
      const phase = this.state.phase === STATES.PAUSED ? this.state.previousPhase : this.state.phase;
      if (phase === STATES.SELECT_START || phase === STATES.PLACE_APPLE) return "apple";
      if (phase === STATES.SNAKE_MOVE) return "snake";
      return this.state.winner;
    }

    playerLabel(role) {
      const { config } = this.state;
      if (config.mode === "hvc") return config.humanRole === role ? "You" : "Computer";
      if (role === "apple") return config.swapped ? "Player 2" : "Player 1";
      return config.swapped ? "Player 1" : "Player 2";
    }

    isComputerTurn() {
      if (!this.state || this.state.config.mode !== "hvc") return false;
      if (![STATES.SELECT_START, STATES.PLACE_APPLE, STATES.SNAKE_MOVE].includes(this.state.phase)) return false;
      return this.activeRole() !== this.state.config.humanRole;
    }

    selectStart(vertex) {
      const state = this.state;
      if (!state || state.phase !== STATES.SELECT_START) return { ok: false, error: "A starting vertex cannot be selected right now." };
      if (!Number.isInteger(vertex) || vertex < 0 || vertex >= state.graph.vertices.length) {
        return { ok: false, error: "That starting vertex is not part of this graph." };
      }
      state.snakeBody = [vertex];
      state.apple = null;
      state.applesEaten = 0;
      state.movesUsed = 0;
      state.totalMoves = 0;
      state.winner = null;
      state.resultReason = "";
      this.addHistory("start", "Starting vertex selected", `Vertex ${vertex} · Snake length 1`);
      state.phase = STATES.PLACE_APPLE;
      this.notify("start-selected");
      return { ok: true };
    }

    placeApple(vertex) {
      const state = this.state;
      if (!state || state.phase !== STATES.PLACE_APPLE) return { ok: false, error: "An apple cannot be placed during the snake’s turn." };
      if (!Number.isInteger(vertex) || vertex < 0 || vertex >= state.graph.vertices.length) {
        return { ok: false, error: "That apple position is not part of this graph." };
      }
      if (state.snakeBody.includes(vertex)) return { ok: false, error: "Apples must be placed on unoccupied vertices." };
      state.apple = vertex;
      state.movesUsed = 0;
      state.phase = STATES.SNAKE_MOVE;
      this.addHistory("apple", "Apple placed", `Vertex ${vertex} · Move counter reset`);
      if (this.legalMoves().length === 0) {
        this.addHistory("loss", "Collision-related loss", "No legal adjacent movement remains.");
        this.endGame("apple", "The snake has no legal adjacent movement and is trapped by its body.");
      } else {
        this.notify("apple-placed");
      }
      return { ok: true };
    }

    legalMoves() {
      const state = this.state;
      if (!state || state.head === null) return [];
      const occupied = state.occupied;
      // When snake length is 2, moving into the tail is reversing directly across its single edge, which is disallowed
      const canMoveToTail = state.snakeBody.length > 2;
      return state.graph.adjacency[state.head].filter((vertex) => {
        const growing = vertex === state.apple;
        if (!occupied.has(vertex)) return true;
        return vertex === state.tail && !growing && canMoveToTail;
      });
    }

    moveSnake(vertex) {
      const state = this.state;
      if (!state || state.phase !== STATES.SNAKE_MOVE) return { ok: false, error: "The snake cannot move right now." };
      if (!Number.isInteger(vertex) || vertex < 0 || vertex >= state.graph.vertices.length) {
        return { ok: false, error: "That destination is not part of this graph." };
      }
      const from = state.head;
      if (!state.graph.adjacency[from].includes(vertex)) return { ok: false, error: "The snake can move only along an existing edge." };
      if (!this.legalMoves().includes(vertex)) {
        const growing = vertex === state.apple;
        let message = "The snake cannot move into its own body.";
        if (growing && vertex === state.tail) {
          message = "The snake cannot grow into its current tail.";
        } else if (vertex === state.tail && state.snakeBody.length === 2) {
          message = "When the snake length is 2, it cannot turn around into its tail.";
        }
        return { ok: false, error: message };
      }

      const ateApple = vertex === state.apple;
      if (!ateApple) state.snakeBody.shift();
      state.snakeBody.push(vertex);
      state.movesUsed += 1;
      state.totalMoves += 1;
      this.addHistory("move", "Snake moved", `Vertex ${from} → ${vertex} · Move ${state.movesUsed}/${state.maxMoves}`);

      if (ateApple) {
        state.applesEaten += 1;
        state.apple = null;
        this.addHistory("eat", "Apple eaten", `Snake length increased to ${state.snakeBody.length}`);
        if (state.snakeBody.length === state.graph.vertices.length) {
          this.endGame("snake", "The snake occupies every vertex of the graph.");
          return { ok: true, ateApple: true };
        }
        state.phase = STATES.PLACE_APPLE;
        this.notify("apple-eaten");
        return { ok: true, ateApple: true };
      }

      if (this.legalMoves().length === 0) {
        this.addHistory("loss", "Collision-related loss", "No legal adjacent movement remains.");
        this.endGame("apple", "The snake has no legal adjacent movement and is trapped by its body.");
        return { ok: true, ateApple: false };
      }
      if (state.movesUsed >= state.maxMoves) {
        this.addHistory("loss", "Movement-limit loss", `${state.movesUsed}/${state.maxMoves} moves used`);
        this.endGame("apple", `The snake used all ${state.maxMoves} movements without eating the current apple.`);
        return { ok: true, ateApple: false };
      }
      this.notify("move");
      return { ok: true, ateApple: false };
    }

    pause() {
      const state = this.state;
      if (!state || ![STATES.SELECT_START, STATES.PLACE_APPLE, STATES.SNAKE_MOVE].includes(state.phase)) return false;
      state.previousPhase = state.phase;
      state.phase = STATES.PAUSED;
      this.notify("pause");
      return true;
    }

    resume() {
      const state = this.state;
      if (!state || state.phase !== STATES.PAUSED) return false;
      state.phase = state.previousPhase;
      state.previousPhase = null;
      this.notify("resume");
      return true;
    }

    endGame(winner, reason) {
      const state = this.state;
      if (!state || state.phase === STATES.GAME_OVER) return;
      state.phase = STATES.GAME_OVER;
      state.previousPhase = null;
      state.winner = winner;
      state.resultReason = reason;
      this.addHistory(winner === "snake" ? "win" : "loss", winner === "snake" ? "Snake Player wins" : "Apple Player wins", reason);
      this.notify("game-over");
    }
  }

  /* ================================================================
     7. Snake AI — BFS recalculated for every move
     ================================================================ */
  class SnakeAI {
    static findPath(state) {
      if (state.apple === null || state.head === null) return null;
      const start = state.head;
      const target = state.apple;
      if (start === target) return [start];
      const blocked = state.occupied;
      // Only allow the tail vertex as a passable destination when snake length > 2
      if (state.tail !== target && state.snakeBody.length > 2) blocked.delete(state.tail);
      const parent = new Map([[start, null]]);
      const queue = [start];
      for (let index = 0; index < queue.length; index += 1) {
        const current = queue[index];
        for (const neighbor of state.graph.adjacency[current]) {
          if (blocked.has(neighbor) || parent.has(neighbor)) continue;
          parent.set(neighbor, current);
          if (neighbor === target) {
            const path = [target];
            let cursor = target;
            while (parent.get(cursor) !== null) {
              cursor = parent.get(cursor);
              path.push(cursor);
            }
            return path.reverse();
          }
          queue.push(neighbor);
        }
      }
      return null;
    }

    static chooseMove(state, rng, engine) {
      const path = this.findPath(state);
      const legal = engine.legalMoves();
      if (path && path.length > 1 && legal.includes(path[1])) return path[1];
      return legal.length ? rng.pick(legal) : null;
    }
  }

  /* ================================================================
     8. Apple AI — uniform random valid placement
     ================================================================ */
  class AppleAI {
    static chooseStart(graph, rng) {
      return rng.pick(graph.vertices.map((vertex) => vertex.id));
    }

    static chooseApple(state, rng) {
      const occupied = state.occupied;
      const available = state.graph.vertices.map((vertex) => vertex.id).filter((vertex) => !occupied.has(vertex));
      return rng.pick(available);
    }
  }

  /* ================================================================
     9. Dynamic SVG graph renderer
     ================================================================ */
  class GraphRenderer {
    constructor(svg, onVertex) {
      this.svg = svg;
      this.onVertex = onVertex;
    }

    element(name, attributes = {}) {
      const node = document.createElementNS(SVG_NS, name);
      for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
      return node;
    }

    render(state, humanInteractive) {
      this.svg.replaceChildren();
      const title = this.element("title", { id: "graph-title" });
      title.textContent = "Interactive game graph";
      const description = this.element("desc", { id: "graph-description" });
      description.textContent = `${state.graph.vertices.length} vertices and ${state.graph.edges.length} undirected edges.`;
      this.svg.append(title, description);
      const edgesGroup = this.element("g", { "aria-hidden": "true" });
      const snakeEdgesGroup = this.element("g", { "aria-hidden": "true" });
      const nodesGroup = this.element("g");
      this.svg.append(edgesGroup, snakeEdgesGroup, nodesGroup);

      const snakeEdges = new Set();
      for (let i = 0; i < state.snakeBody.length - 1; i += 1) {
        snakeEdges.add(edgeKey(state.snakeBody[i], state.snakeBody[i + 1]));
      }
      const headNeighbors = new Set(state.head === null ? [] : state.graph.adjacency[state.head]);
      for (const edge of state.graph.edges) {
        const a = state.graph.vertices[edge.a];
        const b = state.graph.vertices[edge.b];
        const isSnakeEdge = snakeEdges.has(edgeKey(edge.a, edge.b));
        const classes = ["graph-edge"];
        if (isSnakeEdge) {
          classes.push("is-snake-path");
        } else if (headNeighbors.has(edge.a) || headNeighbors.has(edge.b)) {
          classes.push("is-near-head");
        }
        const lineEl = this.element("line", {
          x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: classes.join(" ")
        });
        if (isSnakeEdge) {
          snakeEdgesGroup.appendChild(lineEl);
        } else {
          edgesGroup.appendChild(lineEl);
        }
      }

      const occupied = state.occupied;
      const legal = new Set(state.phase === STATES.SNAKE_MOVE ? this.legalMovesForRender(state) : []);
      for (const vertex of state.graph.vertices) {
        const id = vertex.id;
        const classes = ["vertex"];
        if (id === state.head) classes.push("is-head");
        else if (id === state.tail) classes.push("is-tail");
        else if (occupied.has(id)) classes.push("is-body");
        if (id === state.apple) classes.push("has-apple");
        if (legal.has(id)) classes.push("is-legal");

        let selectable = false;
        if (humanInteractive) {
          if (state.phase === STATES.SELECT_START) selectable = true;
          if (state.phase === STATES.PLACE_APPLE && !occupied.has(id)) selectable = true;
          if (state.phase === STATES.SNAKE_MOVE && legal.has(id)) selectable = true;
        }
        if (selectable) {
          classes.push("is-selectable");
          if (state.phase === STATES.PLACE_APPLE) classes.push("is-apple-choice");
        }
        const group = this.element("g", {
          class: classes.join(" "),
          transform: `translate(${vertex.x} ${vertex.y})`,
          "data-vertex": id,
          role: selectable ? "button" : "img",
          "aria-label": this.vertexLabel(state, id, selectable)
        });
        if (selectable) group.setAttribute("tabindex", "0");
        group.appendChild(this.element("circle", { class: "node-ring", r: 29 }));
        group.appendChild(this.element("circle", { class: "node-circle", r: id === state.head ? 23 : 21 }));
        if (id === state.apple) {
          group.appendChild(this.element("path", { class: "apple-stem", d: "M 0 -20 Q 0 -27 4 -29" }));
          group.appendChild(this.element("path", { class: "apple-leaf", d: "M 3 -25 Q 11 -30 13 -23 Q 8 -20 3 -25" }));
        }
        const label = this.element("text", { class: "vertex-label", y: 1 });
        label.textContent = id;
        group.appendChild(label);
        if (id === state.head || id === state.tail) {
          const caption = this.element("text", { class: "node-caption", y: 40 });
          caption.textContent = id === state.head ? "HEAD" : "TAIL";
          group.appendChild(caption);
        }
        group.addEventListener("click", () => this.onVertex(id));
        if (selectable) {
          group.addEventListener("keydown", (event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              this.onVertex(id);
            }
          });
        }
        nodesGroup.appendChild(group);
      }
    }

    legalMovesForRender(state) {
      if (state.head === null) return [];
      const occupied = state.occupied;
      const canMoveToTail = state.snakeBody.length > 2;
      return state.graph.adjacency[state.head].filter((vertex) => {
        const growing = vertex === state.apple;
        return !occupied.has(vertex) || (vertex === state.tail && !growing && canMoveToTail);
      });
    }

    vertexLabel(state, id, selectable) {
      const parts = [`Vertex ${id}`];
      if (id === state.head) parts.push("snake head");
      else if (id === state.tail) parts.push("snake tail");
      else if (state.snakeBody.includes(id)) parts.push("snake body");
      if (id === state.apple) parts.push("apple");
      if (selectable) parts.push("selectable");
      return parts.join(", ");
    }

    flashIllegal(vertex) {
      const group = this.svg.querySelector(`[data-vertex="${vertex}"]`);
      if (!group) return;
      group.classList.remove("is-illegal");
      requestAnimationFrame(() => group.classList.add("is-illegal"));
    }
  }

  /* ================================================================
     10. Dashboard and move history
     ================================================================ */
  class Dashboard {
    update(engine) {
      const state = engine.state;
      if (!state) return;
      const role = engine.activeRole();
      const isSnake = role === "snake";
      const isComputer = engine.isComputerTurn();
      const turnCard = $("turn-card");
      turnCard.classList.toggle("is-snake", isSnake);
      turnCard.classList.toggle("is-computer", isComputer);

      if (state.phase === STATES.GAME_OVER) {
        $("current-player").textContent = "Final result";
        $("current-role").textContent = state.winner === "snake" ? "Snake wins" : "Apple wins";
        $("turn-instruction").textContent = "Review the result or replay this graph.";
      } else if (state.phase === STATES.PAUSED) {
        $("current-player").textContent = "Match suspended";
        $("current-role").textContent = "Paused";
        $("turn-instruction").textContent = "Resume to continue from this exact state.";
      } else {
        $("current-player").textContent = `${engine.playerLabel(role)}${isComputer ? " · thinking" : ""}`;
        $("current-role").textContent = isSnake ? "Snake’s turn" : "Apple’s turn";
        $("turn-instruction").textContent = this.instruction(state.phase, isComputer);
      }

      $("stat-length").textContent = state.snakeBody.length;
      $("stat-vertices").textContent = state.graph.vertices.length;
      $("stat-unoccupied").textContent = state.graph.vertices.length - state.snakeBody.length;
      $("stat-apples").textContent = state.applesEaten;
      $("stat-apple-position").textContent = state.apple === null ? "—" : `Vertex ${state.apple}`;
      $("stat-apple-position").classList.toggle("is-text", state.apple !== null);
      $("stat-total-moves").textContent = state.totalMoves;
      $("stat-moves").textContent = state.movesUsed;
      $("stat-max-moves").textContent = state.maxMoves;
      const ratio = clamp(state.movesUsed / state.maxMoves, 0, 1);
      $("moves-progress").style.width = `${ratio * 100}%`;
      $("moves-progress").classList.toggle("is-warning", ratio >= 0.65 && ratio < 0.85);
      $("moves-progress").classList.toggle("is-danger", ratio >= 0.85);
      $("stat-graph-mode").textContent = GRAPH_LABELS[state.graph.type];
      $("stat-seed").textContent = state.seed;
      $("stat-seed").title = state.seed;
      $("match-label").textContent = `MATCH 01 · ${state.config.mode === "hvh" ? "HUMAN VS HUMAN" : "HUMAN VS COMPUTER"}`;
      $("heading-graph-type").textContent = GRAPH_LABELS[state.graph.type];
      $("heading-seed").textContent = `Seed · ${state.seed}`;
      $("heading-seed").title = state.seed;
      $("phase-badge").textContent = state.phase.replaceAll("_", " ");
      $("board-title").textContent = this.boardTitle(state);
      $("board-hint").textContent = isComputer ? "Computer action in progress" : this.boardHint(state);
      $("pause-button").querySelector("span").textContent = state.phase === STATES.PAUSED ? "Resume match" : "Pause match";
      $("pause-button").disabled = state.phase === STATES.GAME_OVER;
    }

    instruction(phase, computer) {
      if (computer) {
        if (phase === STATES.SNAKE_MOVE) return "BFS is recalculating the next edge.";
        return "Choosing uniformly from valid vertices.";
      }
      if (phase === STATES.SELECT_START) return "Choose the snake’s starting vertex.";
      if (phase === STATES.PLACE_APPLE) return "Place an apple on an unoccupied vertex.";
      if (phase === STATES.SNAKE_MOVE) return "Move to a highlighted adjacent vertex.";
      return "Review the current match state.";
    }

    boardTitle(state) {
      if (state.phase === STATES.SELECT_START) return "Choose the beginning";
      if (state.phase === STATES.PLACE_APPLE) return "Place the next objective";
      if (state.phase === STATES.SNAKE_MOVE) return "Trace a path to the apple";
      if (state.phase === STATES.PAUSED) return "The graph is holding still";
      if (state.phase === STATES.GAME_OVER) return "The match is complete";
      return "The graph awaits";
    }

    boardHint(state) {
      if (state.phase === STATES.SELECT_START) return "Every vertex is available";
      if (state.phase === STATES.PLACE_APPLE) return "Occupied vertices are excluded";
      if (state.phase === STATES.SNAKE_MOVE) return "Only highlighted moves are legal";
      return "Graph interactions are disabled";
    }
  }

  class HistoryManager {
    render(state) {
      const list = $("history-list");
      list.replaceChildren();
      $("history-count").textContent = state.history.length;
      const events = state.history.slice().reverse();
      for (const event of events) {
        const item = document.createElement("li");
        item.className = `history-item history-item--${event.type}`;
        item.dataset.number = String(event.number).padStart(2, "0");
        const title = document.createElement("strong");
        title.textContent = event.title;
        item.appendChild(title);
        if (event.detail) {
          const detail = document.createElement("span");
          detail.textContent = event.detail;
          item.appendChild(detail);
        }
        list.appendChild(item);
      }
    }
  }

  /* ================================================================
     11. UI controller, controls, dialogs, and cancellable AI timers
     ================================================================ */
  class UIController {
    constructor() {
      this.engine = new GameEngine();
      this.renderer = new GraphRenderer($("graph-svg"), (vertex) => this.handleVertex(vertex));
      this.dashboard = new Dashboard();
      this.history = new HistoryManager();
      this.config = null;
      this.graph = null;
      this.seed = "";
      this.appleRng = null;
      this.snakeRng = null;
      this.aiTimer = null;
      this.aiToken = 0;
      this.toastTimer = null;
      this.bindControls();
      this.updateSetup();
      this.engine.subscribe((event) => this.onEngineChange(event));
    }

    bindControls() {
      $("setup-form").addEventListener("submit", (event) => {
        event.preventDefault();
        this.startFromSetup();
      });
      document.querySelectorAll('input[name="game-mode"], input[name="graph-mode"]').forEach((input) => {
        input.addEventListener("change", () => this.updateSetup());
      });
      ["theta-p", "theta-q", "theta-r"].forEach((id) => $(id).addEventListener("input", () => this.updateThetaValidation()));
      $("vertex-count").addEventListener("input", () => this.updateSetupValidation());
      $("brand-home").addEventListener("click", () => this.returnHome());
      $("home-button").addEventListener("click", () => this.returnHome());
      $("end-home-button").addEventListener("click", () => this.returnHome());
      $("pause-button").addEventListener("click", () => this.togglePause());
      $("resume-button").addEventListener("click", () => this.resume());
      $("restart-button").addEventListener("click", () => this.restartMatch());
      $("replay-button").addEventListener("click", () => this.restartMatch());
      $("new-graph-button").addEventListener("click", () => this.generateNewGraph());
      $("end-new-graph-button").addEventListener("click", () => this.generateNewGraph());
      $("swap-button").addEventListener("click", () => this.swapAndReplay());
      $("properties-button").addEventListener("click", () => this.showProperties());
      $("close-properties").addEventListener("click", () => this.closeProperties());
      $("properties-modal").addEventListener("click", (event) => {
        if (event.target === $("properties-modal")) this.closeProperties();
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !$("properties-modal").hidden) this.closeProperties();
        if ((event.key === "p" || event.key === "P") && !$("game-screen").hidden
          && $("properties-modal").hidden && $("end-modal").hidden) {
          event.preventDefault();
          this.togglePause();
        }
      });
      document.addEventListener("visibilitychange", () => {
        if (document.hidden && !$("game-screen").hidden && this.engine.state
          && [STATES.SELECT_START, STATES.PLACE_APPLE, STATES.SNAKE_MOVE].includes(this.engine.state.phase)) {
          this.pause();
        }
      });
    }

    updateSetup() {
      const gameMode = document.querySelector('input[name="game-mode"]:checked').value;
      const graphMode = document.querySelector('input[name="graph-mode"]:checked').value;
      $("role-options").hidden = gameMode !== "hvc";
      $("general-options").hidden = graphMode === "theta";
      $("theta-options").hidden = graphMode !== "theta";
      $("density-field").hidden = graphMode !== "general";
      this.updateThetaValidation();
      this.updateSetupValidation();
    }

    updateThetaValidation() {
      const p = $("theta-p").value;
      const q = $("theta-q").value;
      const r = $("theta-r").value;
      const validation = GraphGenerator.validateTheta(p, q, r);
      $("theta-total").textContent = Number.isFinite(validation.total) ? `${validation.total} vertices` : "Invalid total";
      const note = $("theta-validation");
      note.classList.toggle("is-error", !validation.valid);
      if (!validation.valid) {
        note.textContent = validation.message;
      } else {
        const winnable = GraphAnalyzer.classifyTheta(p, q, r);
        const reason = [Number(p), Number(q), Number(r)].includes(1)
          ? "one path has length 1"
          : [Number(p), Number(q), Number(r)].filter((length) => length === 2).length >= 2
            ? "two paths have length 2"
            : "neither sufficient condition is met";
        note.textContent = `Theorem 4: ${winnable ? "snake-winnable" : "not snake-winnable"} — ${reason}.`;
      }
      [$("theta-p"), $("theta-q"), $("theta-r")].forEach((input) => input.setAttribute("aria-invalid", String(!validation.valid)));
      this.updateSetupValidation();
      return validation;
    }

    updateSetupValidation() {
      const graphMode = document.querySelector('input[name="graph-mode"]:checked').value;
      let valid = true;
      let message = "";
      if (graphMode === "theta") {
        const validation = GraphGenerator.validateTheta($("theta-p").value, $("theta-q").value, $("theta-r").value);
        valid = validation.valid;
        message = validation.valid ? "" : validation.message;
      } else {
        const count = Number($("vertex-count").value);
        valid = Number.isInteger(count) && count >= 6 && count <= 16;
        message = valid ? "" : "Vertex count must be an integer from 6 to 16.";
        $("vertex-count").setAttribute("aria-invalid", String(!valid));
      }
      $("setup-error").textContent = message;
      $("setup-form").querySelector(".button--start").disabled = !valid;
      return valid;
    }

    readConfiguration() {
      if (!this.updateSetupValidation()) return null;
      const graphMode = document.querySelector('input[name="graph-mode"]:checked').value;
      return {
        mode: document.querySelector('input[name="game-mode"]:checked').value,
        humanRole: document.querySelector('input[name="human-role"]:checked').value,
        graphMode,
        vertices: Number($("vertex-count").value),
        density: $("graph-density").value,
        theta: {
          p: Number($("theta-p").value),
          q: Number($("theta-q").value),
          r: Number($("theta-r").value)
        },
        swapped: false
      };
    }

    createGraph(config, seed) {
      const rng = new SeededRandom(`${seed}::graph`);
      if (config.graphMode === "general") return GraphGenerator.general(config.vertices, config.density, rng);
      if (config.graphMode === "research") return GraphGenerator.research(config.vertices, rng);
      return GraphGenerator.theta(config.theta.p, config.theta.q, config.theta.r, rng);
    }

    startFromSetup() {
      const config = this.readConfiguration();
      if (!config) return;
      const requestedSeed = $("seed-input").value.trim();
      const seed = requestedSeed || createSeed();
      try {
        const graph = this.createGraph(config, seed);
        this.config = config;
        this.seed = seed;
        this.graph = graph;
        this.showGame();
        this.beginMatch();
      } catch (error) {
        $("setup-error").textContent = error.message;
      }
    }

    beginMatch() {
      this.cancelAI();
      this.hideAllModals();
      this.appleRng = new SeededRandom(`${this.seed}::apple-ai`);
      this.snakeRng = new SeededRandom(`${this.seed}::snake-ai`);
      this.engine.startMatch(this.config, GraphGenerator.cloneGraph(this.graph), this.seed);
      $("history-panel").open = false;
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    showGame() {
      $("home-screen").hidden = true;
      $("home-screen").classList.remove("screen--active");
      $("game-screen").hidden = false;
      $("game-screen").classList.add("screen--active");
    }

    returnHome() {
      this.cancelAI();
      this.hideAllModals();
      $("game-screen").hidden = true;
      $("game-screen").classList.remove("screen--active");
      $("home-screen").hidden = false;
      $("home-screen").classList.add("screen--active");
      $("setup-error").textContent = "";
      window.scrollTo({ top: 0, behavior: "smooth" });
    }

    restartMatch() {
      if (!this.graph || !this.config) return;
      this.beginMatch();
      this.showToast("Match restarted on the same graph and seed.");
    }

    swapAndReplay() {
      if (!this.config || this.config.mode !== "hvh") return;
      this.config = { ...this.config, swapped: !this.config.swapped };
      this.beginMatch();
      this.showToast("Roles swapped. Apple opens the new match.");
    }

    generateNewGraph() {
      if (!this.config) return;
      this.cancelAI();
      const newSeed = createSeed();
      try {
        const graph = this.createGraph(this.config, newSeed);
        this.seed = newSeed;
        this.graph = graph;
        this.showGame();
        this.beginMatch();
        this.showToast("New planar graph generated with a fresh seed.");
      } catch (error) {
        this.showToast(error.message);
      }
    }

    togglePause() {
      if (!this.engine.state) return;
      if (this.engine.state.phase === STATES.PAUSED) this.resume();
      else this.pause();
    }

    pause() {
      if (this.engine.pause()) {
        this.cancelAI();
        $("pause-overlay").hidden = false;
        $("resume-button").focus();
      }
    }

    resume() {
      if (this.engine.resume()) {
        $("pause-overlay").hidden = true;
        $("pause-button").focus();
      }
    }

    handleVertex(vertex) {
      const state = this.engine.state;
      if (!state || $("game-screen").hidden) return;
      if (state.phase === STATES.PAUSED || state.phase === STATES.GAME_OVER) return;
      if (this.engine.isComputerTurn()) {
        this.setFeedback("The computer is acting. Manual graph interaction is disabled.", "error");
        return;
      }
      let result = { ok: false, error: "No action is available in this state." };
      if (state.phase === STATES.SELECT_START) result = this.engine.selectStart(vertex);
      else if (state.phase === STATES.PLACE_APPLE) result = this.engine.placeApple(vertex);
      else if (state.phase === STATES.SNAKE_MOVE) result = this.engine.moveSnake(vertex);
      if (!result.ok) {
        this.setFeedback(result.error, "error");
        this.renderer.flashIllegal(vertex);
      }
    }

    onEngineChange(event) {
      const state = this.engine.state;
      if (!state) return;
      if (event === "game-over" || event === "pause" || event === "start") this.cancelAI();
      const humanInteractive = !this.engine.isComputerTurn()
        && [STATES.SELECT_START, STATES.PLACE_APPLE, STATES.SNAKE_MOVE].includes(state.phase);
      this.renderer.render(state, humanInteractive);
      this.dashboard.update(this.engine);
      this.history.render(state);
      this.setEventFeedback(event);
      if (event === "pause") $("pause-overlay").hidden = false;
      if (event === "resume") $("pause-overlay").hidden = true;
      if (event === "game-over") this.showEndGame();
      this.syncAI();
    }

    setEventFeedback(event) {
      const state = this.engine.state;
      const messages = {
        start: ["Apple selects the snake’s starting vertex.", ""],
        "start-selected": [`Vertex ${state.head} selected. Apple now places the first apple.`, ""],
        "apple-placed": [`Apple placed at vertex ${state.apple}. Snake has ${state.maxMoves} moves to eat it.`, ""],
        move: [`Snake moved to vertex ${state.head}. ${state.maxMoves - state.movesUsed} moves remain for this apple.`, ""],
        "apple-eaten": [`Apple eaten — snake length is now ${state.snakeBody.length}. Apple places the next apple.`, "success"],
        pause: ["Match paused. The current state is preserved.", ""],
        resume: ["Match resumed. Continue from the preserved state.", ""],
        "game-over": [state.resultReason, state.winner === "snake" ? "success" : "error"]
      };
      if (messages[event]) this.setFeedback(...messages[event]);
      if (event === "apple-eaten") {
        const container = $("graph-container");
        container.classList.remove("apple-flash");
        requestAnimationFrame(() => container.classList.add("apple-flash"));
      }
    }

    setFeedback(message, type = "") {
      const feedback = $("graph-feedback");
      feedback.textContent = message;
      feedback.classList.toggle("is-error", type === "error");
      feedback.classList.toggle("is-success", type === "success");
    }

    syncAI() {
      if (this.aiTimer !== null || !this.engine.isComputerTurn() || $("game-screen").hidden) return;
      const token = this.aiToken;
      const session = this.engine.session;
      this.aiTimer = window.setTimeout(() => {
        this.aiTimer = null;
        if (token !== this.aiToken || session !== this.engine.session || !this.engine.isComputerTurn()) return;
        const state = this.engine.state;
        let result = { ok: false, error: "No computer action is available." };
        if (state.phase === STATES.SELECT_START) {
          result = this.engine.selectStart(AppleAI.chooseStart(state.graph, this.appleRng));
        } else if (state.phase === STATES.PLACE_APPLE) {
          result = this.engine.placeApple(AppleAI.chooseApple(state, this.appleRng));
        } else if (state.phase === STATES.SNAKE_MOVE) {
          const move = SnakeAI.chooseMove(state, this.snakeRng, this.engine);
          if (move === null) this.engine.endGame("apple", "The computer snake has no legal adjacent movement.");
          else result = this.engine.moveSnake(move);
        }
        if (!result.ok) this.setFeedback(`Computer action stopped: ${result.error}`, "error");
      }, AI_DELAY);
    }

    cancelAI() {
      this.aiToken += 1;
      if (this.aiTimer !== null) {
        clearTimeout(this.aiTimer);
        this.aiTimer = null;
      }
    }

    showProperties() {
      const state = this.engine.state;
      if (!state) return;
      const graph = state.graph;
      const degrees = GraphAnalyzer.degrees(graph);
      const articulation = GraphAnalyzer.articulationPoints(graph);
      const connected = GraphAnalyzer.isConnected(graph);
      const twoConnected = GraphAnalyzer.isTwoVertexConnected(graph);
      const hasPath = GraphAnalyzer.hasHamiltonianPath(graph);
      const hasCycle = GraphAnalyzer.hasHamiltonianCycle(graph);
      const planar = GraphAnalyzer.isPlanarDrawing(graph);
      const cards = [
        ["Vertices", graph.vertices.length, ""],
        ["Edges", GraphAnalyzer.edgeCount(graph), ""],
        ["Planar embedding", planar ? "Yes" : "No", planar ? "is-yes" : "is-no"],
        ["Minimum degree", Math.min(...degrees), ""],
        ["Maximum degree", Math.max(...degrees), ""],
        ["Connected", connected ? "Yes" : "No", connected ? "is-yes" : "is-no"],
        ["2-vertex-connected", twoConnected ? "Yes" : "No", twoConnected ? "is-yes" : "is-no"],
        ["Hamiltonian path", hasPath ? "Exists" : "None", hasPath ? "is-yes" : "is-no"],
        ["Hamiltonian cycle", hasCycle ? "Exists" : "None", hasCycle ? "is-yes" : "is-no"]
      ];
      const observations = GraphAnalyzer.researchObservations(graph);
      $("properties-content").innerHTML = `
        <div class="property-grid">${cards.map(([label, value, className]) => `
          <div class="property-card"><span>${escapeHTML(label)}</span><strong class="${className}">${escapeHTML(value)}</strong></div>`).join("")}
        </div>
        <section class="analysis-section">
          <h3>Vertex degrees</h3>
          <table class="degree-table"><thead><tr><th>Vertex</th><th>Degree</th><th>Vertex</th><th>Degree</th></tr></thead>
          <tbody>${this.degreeRows(degrees)}</tbody></table>
          <p class="analysis-note">Articulation points (Tarjan): ${articulation.length ? articulation.map((v) => `Vertex ${v}`).join(", ") : "None"}</p>
        </section>
        <section class="analysis-section">
          <h3>Research-Based Observations</h3>
          <div class="observation-list">${observations.map((observation) => `
            <div class="observation is-${observation.kind}">${escapeHTML(observation.text)}</div>`).join("")}</div>
          <p class="analysis-note">These classifications are theoretical observations, separate from this match’s result. The ${state.maxMoves}-move limit is a gameplay rule, not a research theorem. A Hamiltonian path alone does not imply snake-winnability.</p>
        </section>`;
      $("properties-modal").hidden = false;
      $("close-properties").focus();
    }

    degreeRows(degrees) {
      const midpoint = Math.ceil(degrees.length / 2);
      let rows = "";
      for (let i = 0; i < midpoint; i += 1) {
        const right = i + midpoint;
        rows += `<tr><td>${i}</td><td>${degrees[i]}</td><td>${right < degrees.length ? right : "—"}</td><td>${right < degrees.length ? degrees[right] : "—"}</td></tr>`;
      }
      return rows;
    }

    closeProperties() {
      $("properties-modal").hidden = true;
      if (!$("game-screen").hidden) $("properties-button").focus();
    }

    showEndGame() {
      const state = this.engine.state;
      const snakeWon = state.winner === "snake";
      $("result-title").textContent = snakeWon ? "Snake Player Wins" : "Apple Player Wins";
      $("result-reason").textContent = state.resultReason;
      $("result-mark").textContent = snakeWon ? "S" : "A";
      $("result-mark").classList.toggle("is-apple", !snakeWon);
      const stats = [
        ["Final snake length", state.snakeBody.length],
        ["Total vertices", state.graph.vertices.length],
        ["Apples eaten", state.applesEaten],
        ["Total snake movements", state.totalMoves],
        ["Graph type", GRAPH_LABELS[state.graph.type]],
        ["Random seed", state.seed]
      ];
      const list = $("result-stats");
      list.replaceChildren();
      for (const [label, value] of stats) {
        const item = document.createElement("div");
        const term = document.createElement("dt");
        const detail = document.createElement("dd");
        term.textContent = label;
        detail.textContent = value;
        detail.title = String(value);
        item.append(term, detail);
        list.appendChild(item);
      }
      $("swap-button").hidden = state.config.mode !== "hvh";
      $("end-modal").hidden = false;
      $("replay-button").focus();
    }

    hideAllModals() {
      $("pause-overlay").hidden = true;
      $("properties-modal").hidden = true;
      $("end-modal").hidden = true;
    }

    showToast(message) {
      const toast = $("toast");
      clearTimeout(this.toastTimer);
      toast.textContent = message;
      toast.classList.add("is-visible");
      this.toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 2600);
    }
  }

  /* ================================================================
     12. Application initialization
     ================================================================ */
  new UIController();

  /* ================================================================
     13. Isolated self-tests — never touch the active UI match
     ================================================================ */
  function runSelfTests() {
    const results = [];
    const test = (name, callback) => {
      try {
        callback();
        results.push({ name, passed: true, message: "Passed" });
      } catch (error) {
        results.push({ name, passed: false, message: error.message });
      }
    };
    const assert = (condition, message = "Assertion failed") => {
      if (!condition) throw new Error(message);
    };
    const equal = (actual, expected, message = "Values differ") => {
      if (!Object.is(actual, expected)) throw new Error(`${message}: expected ${expected}, received ${actual}`);
    };
    const same = (actual, expected, message = "Arrays differ") => {
      assert(JSON.stringify(actual) === JSON.stringify(expected), `${message}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`);
    };
    const knownGraph = (n, pairs, type = "general") => {
      const graph = GraphGenerator.emptyGraph(n, type);
      pairs.forEach(([a, b]) => GraphGenerator.addEdge(graph, a, b));
      return GraphGenerator.finalize(graph);
    };
    const pathGraph = (n) => knownGraph(n, Array.from({ length: n - 1 }, (_, i) => [i, i + 1]));
    const engineFor = (graph) => {
      const engine = new GameEngine();
      engine.startMatch({ mode: "hvh", humanRole: "snake", swapped: false }, graph, "self-test");
      return engine;
    };
    const assertSimpleUndirected = (graph) => {
      const keys = new Set();
      graph.edges.forEach((edge) => {
        assert(edge.a !== edge.b, "Self-loop found");
        const key = edgeKey(edge.a, edge.b);
        assert(!keys.has(key), "Duplicate edge found");
        keys.add(key);
        assert(graph.adjacency[edge.a].includes(edge.b) && graph.adjacency[edge.b].includes(edge.a), "Directed adjacency found");
      });
      equal(keys.size, graph.edges.length, "Edge list mismatch");
    };

    test("Seeded graph generation and AI streams are reproducible", () => {
      const a = GraphGenerator.general(10, "medium", new SeededRandom("repeat::graph"));
      const b = GraphGenerator.general(10, "medium", new SeededRandom("repeat::graph"));
      same(a.edges, b.edges, "Graph edges are not reproducible");
      same(a.vertices, b.vertices, "Graph layout is not reproducible");
      const rngA = new SeededRandom("repeat::apple-ai");
      const rngB = new SeededRandom("repeat::apple-ai");
      same(Array.from({ length: 12 }, () => rngA.next()), Array.from({ length: 12 }, () => rngB.next()));
    });

    test("General, Research, and Theta graphs are planar and unclustered", () => {
      for (const n of [6, 10, 16]) {
        for (const density of Object.keys(DENSITIES)) {
          const graph = GraphGenerator.general(n, density, new SeededRandom(`${n}-${density}`));
          assert(GraphAnalyzer.isConnected(graph), `Disconnected ${n}-${density} graph`);
          assertSimpleUndirected(graph);
          assert(PlanarGeometry.isValidPlanarLayout(graph.vertices, graph.edges, 105, 30), `General ${n}-${density} is non-planar or clustered`);
        }
        const rGraph = GraphGenerator.research(n, new SeededRandom(`research-${n}`));
        assertSimpleUndirected(rGraph);
        assert(GraphAnalyzer.isConnected(rGraph), `Research ${n} disconnected`);
        assert(GraphAnalyzer.isTwoVertexConnected(rGraph), `Research ${n} not 2-connected`);
        assert(GraphAnalyzer.hasHamiltonianPath(rGraph), `Research ${n} lacks Hamiltonian path`);
        assert(!GraphAnalyzer.hasHamiltonianCycle(rGraph), `Research ${n} has Hamiltonian cycle`);
        assert(PlanarGeometry.isValidPlanarLayout(rGraph.vertices, rGraph.edges, 100, 30), `Research ${n} is non-planar or clustered`);
      }
      for (const [p, q, r] of [[1, 3, 3], [2, 2, 3], [3, 3, 3], [1, 2, 8]]) {
        const tGraph = GraphGenerator.theta(p, q, r, new SeededRandom(`${p}-${q}-${r}`));
        equal(tGraph.vertices.length, p + q + r - 1, "Theta vertex formula");
        assert(GraphGenerator.hasThreeInternallyDisjointPaths(tGraph), "Theta paths are not internally disjoint");
        assertSimpleUndirected(tGraph);
        assert(PlanarGeometry.isValidPlanarLayout(tGraph.vertices, tGraph.edges, 55, 18), `Theta ${p}-${q}-${r} is non-planar`);
      }
    });

    test("When snake length is 2, snake cannot turn around into its tail", () => {
      const engine = engineFor(pathGraph(5));
      engine.state.snakeBody = [0, 1];
      engine.state.phase = STATES.SNAKE_MOVE;
      engine.state.apple = 4;
      assert(!engine.legalMoves().includes(0), "Tail vertex 0 should be illegal at length 2");
      assert(engine.legalMoves().includes(2), "Forward vertex 2 should be legal at length 2");
      const moveBack = engine.moveSnake(0);
      assert(!moveBack.ok, "Moving into tail at length 2 should be rejected");
      same(engine.state.snakeBody, [0, 1], "Snake body should remain unchanged after rejected move");
      equal(engine.state.movesUsed, 0, "Rejected move should not consume move budget");
    });

    test("When snake length is > 2, current tail is legal on a non-growing move", () => {
      const engine = engineFor(knownGraph(3, [[0,1],[1,2],[2,0]]));
      engine.state.snakeBody = [0, 1, 2];
      engine.state.phase = STATES.SNAKE_MOVE;
      engine.state.apple = null;
      assert(engine.legalMoves().includes(0));
      assert(engine.moveSnake(0).ok);
      same(engine.state.snakeBody, [1, 2, 0]);
    });

    test("SnakeAI BFS respects length-2 tail restriction", () => {
      const engine = engineFor(pathGraph(4));
      engine.state.snakeBody = [1, 2];
      engine.state.apple = 0;
      engine.state.phase = STATES.SNAKE_MOVE;
      // Path 2 -> 1 -> 0 is blocked because snake has length 2 and cannot reverse into tail 1
      equal(SnakeAI.findPath(engine.state), null);
    });

    const passed = results.filter((result) => result.passed).length;
    const failed = results.length - passed;
    console.group(`SnakeGraphGame self-tests: ${passed}/${results.length} passed`);
    results.forEach((result) => {
      const method = result.passed ? "log" : "error";
      console[method](`${result.passed ? "PASS" : "FAIL"} · ${result.name}${result.passed ? "" : ` — ${result.message}`}`);
    });
    console.groupEnd();
    return { total: results.length, passed, failed, results };
  }

  window.SnakeGraphGame = Object.freeze({ runSelfTests });
})();