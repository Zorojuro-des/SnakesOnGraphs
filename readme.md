# Build: Playing Snake on Graphs — Complete Interactive Game

Act as a senior software engineer specializing in graph algorithms, JavaScript game development, and interactive visualization.

I want you to develop a complete, fully functional, polished graph-based Snake game based on a mathematical research project.

**Your task is to implement the application directly in the current working directory. Do not merely provide code snippets or an implementation plan. Create the files, implement all functionality, and test the application.**

Before starting, inspect the current working directory. Preserve any unrelated files, but maintain the following exact project structure for this application.

```text
playing-snake-on-graphs/
│
├── index.html
├── styles.css
└── scripts.js
```

Do not create any additional source files, directories, package files, or dependencies.

---

# 1. Project Concept

This is a graph-based strategy game involving two opposing roles:

**Snake Player**
- Controls a snake that moves along the edges of a graph.
- Attempts to eat apples placed on unoccupied vertices.
- Wins when the snake occupies every vertex of the graph.

**Apple Player**
- Chooses the snake's initial starting position.
- Places apples on unoccupied vertices.
- Attempts to trap the snake before it occupies the entire graph.

Unlike a conventional Snake game, the game must operate on arbitrary undirected graphs instead of a rectangular grid.

Each graph vertex represents a position, and each edge represents a possible snake movement.

The game must support:

1. Human vs Human.
2. Human vs Computer.

The computer must have simple AI:
- Random apple placement when playing as Apple.
- Breadth-First Search (BFS) when playing as Snake.

Do not implement complicated AI strategies.

---

# 2. Technology Requirements

Use only:

- HTML5
- CSS3
- Vanilla JavaScript
- SVG for graph visualization

Strict requirements:

1. No React, Angular, Vue, TypeScript, Node.js, databases, backend, external libraries, frameworks, APIs, or CDNs.
2. Everything must work offline.
3. The application must run by opening `index.html` directly in a modern browser.
4. Use conventional JavaScript script loading with `defer`, not ES modules.
5. Keep all JavaScript in `scripts.js`.
6. Keep all CSS in `styles.css`.
7. Keep all HTML in `index.html`.
8. Organize JavaScript into clearly separated sections with classes and descriptive comments.
9. Use an IIFE or a single application namespace to avoid polluting the global scope.
10. Do not introduce unnecessary architectural complexity.

The three files should collectively contain the complete application.

Expose a single global interface named `SnakeGraphGame`, with at least the following method:

```javascript
SnakeGraphGame.runSelfTests();
```

---

# 3. Core Game Rules

These rules must be implemented exactly.

## 3.1 Initial Game Setup

The game begins with a randomly generated connected graph.

Initially, the graph contains neither a snake nor an apple.

The initialization sequence is:

1. Generate the graph.
2. The Apple Player selects any vertex.
3. This vertex becomes the snake's starting position.
4. Initialize the snake with a length of exactly 1.
5. The Apple Player selects another unoccupied vertex and places the first apple.
6. The Snake Player gets control.
7. The Snake Player moves towards the apple.

Important:

- The Apple Player chooses the starting position in every game mode.
- The starting vertex is not an apple placement.
- The initial snake position does not count as an apple eaten.
- Starting vertex selection does not count as a snake movement.
- The first apple is placed only after the snake has been initialized.

## 3.2 Snake Representation

Represent the snake as an ordered array:

```javascript
snakeBody = [tail, ..., head];
```

The first element represents the tail, and the last element represents the head.

The snake's length is equal to the array length.

## 3.3 Snake Movement

The snake can move only to an adjacent vertex.

Rules:

1. A normal move removes the tail and appends the new head.
2. Eating an apple increases the snake length by one.
3. When an apple is eaten, the tail does not move.
4. The snake cannot move into its own body.
5. The snake can move into its current tail vertex when making a normal, non-growth move, because the tail moves away simultaneously.
6. Moving into the tail is not allowed when the move involves eating an apple.

Implement the tail movement and collision validation carefully.

## 3.4 Apple Placement

The Apple Player can place an apple on any unoccupied vertex.

After the snake eats an apple:

1. Increase the apple count.
2. Increase snake length by one.
3. Check whether the snake occupies all graph vertices.
4. If yes, the Snake Player wins immediately.
5. Otherwise, return control to the Apple Player.
6. The Apple Player places another apple.
7. The Snake Player continues moving.

An apple must never be placed on a vertex occupied by the snake.

## 3.5 Movement Limit

Introduce a movement limit to prevent the Snake Player from avoiding an apple indefinitely.

Let:

- `n` = total graph vertices.
- `movesUsed` = successful snake edge traversals since the current apple was placed.

Maximum movements per apple:

```javascript
MAX_MOVES = 2 * n;
```

Rules:

- Increment the counter after every successful movement.
- Invalid movements must not increment the counter.
- Reset the counter to zero whenever a new apple is placed.
- If the snake eats the apple on its `2 * n`-th movement, the apple is considered successfully eaten.
- If the snake completes `2 * n` movements without eating the current apple, the Apple Player wins.

Check apple consumption and Snake victory before applying the movement-limit loss condition.

## 3.6 Winning Conditions

Snake wins when:

```javascript
snakeBody.length === graph.vertices.length
```

Apple wins when:
- The snake has no legal adjacent movement.
- The snake reaches the movement limit without eating the current apple.

Do not declare an Apple victory just because BFS temporarily fails to find a route.

---

# 4. Game Modes

## 4.1 Human vs Human

Two players share the same computer.

- Player 1 plays as Apple.
- Player 2 plays as Snake.

Game sequence:

1. Generate the graph.
2. Player 1 chooses the snake's starting vertex.
3. Player 1 places the first apple.
4. Player 2 moves the snake one edge at a time.
5. Player 2 continues until the apple is eaten or the game ends.
6. Player 1 places another apple.
7. Repeat.

Display the active player's role prominently.

After a match, allow players to swap roles and replay on the same graph.

## 4.2 Human vs Computer

Let the human select their role.

### Option A: Human plays as Snake

The computer plays as Apple.

Computer behaviour:

1. Randomly select the initial snake starting vertex.
2. Randomly place the first apple on an unoccupied vertex.
3. Wait for the human to move.
4. Whenever the human eats an apple, randomly select another unoccupied vertex.
5. Repeat until the game ends.

Apple placement must be uniformly random among all valid unoccupied vertices.

There should be no strategic evaluation.

### Option B: Human plays as Apple

The human:
1. Selects the initial snake starting vertex.
2. Places the first apple.
3. Places subsequent apples after the computer eats the current apple.

The computer controls the snake using BFS.

---

# 5. Artificial Intelligence

Keep the AI deliberately simple.

## 5.1 Apple AI — Random Placement

Implement an Apple AI class.

It must support:

- Random starting vertex selection.
- Random unoccupied vertex selection for subsequent apples.

Use a list of currently unoccupied vertices and select uniformly at random.

Do not use graph distance, degree, vertex connectivity, future movement predictions, or strategic evaluation.

## 5.2 Snake AI — BFS

Implement the Snake AI using Breadth-First Search.

Algorithm:

1. Start BFS at the current snake head.
2. Explore adjacent vertices.
3. Avoid vertices occupied by the snake.
4. Allow the current tail as a potentially traversable vertex for a non-growth move, since the tail moves forward simultaneously.
5. Find the shortest route to the apple.
6. Reconstruct the path using parent pointers.
7. Select only the next movement.
8. Validate that movement against the actual current game state.
9. Execute the movement.
10. Recalculate BFS using the updated snake body.

**Important:** Never calculate an entire route once and blindly execute every step. Recalculate after every movement because the body changes.

### BFS fallback

If BFS cannot find a current route but the snake still has legal adjacent moves:

- Do not declare the Apple Player the winner.
- Get all currently legal adjacent vertices.
- Select one randomly.
- Execute that movement.
- Recalculate BFS using the updated state.

Declare an Apple victory only when no legal movement exists or the movement limit is reached.

### AI animation

The computer should move one edge at a time.

Use a configurable delay of approximately 300–500 ms between movements.

Disable human graph interactions during computer movement.

Use cancellable timers or action tokens so that pending AI actions cannot execute after:
- Pause.
- Restart.
- New graph generation.
- Game termination.

---

# 6. Graph Generation

Generate simple, connected, undirected graphs.

Constraints:

- Minimum 6 vertices.
- Maximum 16 vertices.
- No self-loops.
- No duplicate edges.
- Every generated graph must be connected.

Represent graphs using an adjacency list.

Implement three graph generation modes.

## 6.1 General Random Graph

1. Generate the requested number of vertices.
2. Generate a random spanning tree to ensure connectivity.
3. Consider all remaining possible edges.
4. Add edges based on the selected density.

Density settings:

| Density | Additional edge probability |
|---|---:|
| Sparse | 0.15 |
| Medium | 0.30 |
| Dense | 0.55 |

These probabilities apply to remaining possible edges after the spanning tree has been constructed.

## 6.2 Research Challenge Graph

Generate graphs with these properties:

- Between 6 and 16 vertices.
- 2-vertex-connected.
- Contains a Hamiltonian path.
- Does not contain a Hamiltonian cycle.

Use the following base construction:

1. Create a path consisting of vertices `0, 1, ..., n-1`.
2. Add edge `(0, n-2)`.
3. Add edge `(1, n-1)`.
4. Randomly permute vertex labels.

This provides a valid base graph for the specified size range.

For additional graph variety:

- Consider missing edges in randomized order.
- Add an edge only if the resulting graph still has no Hamiltonian cycle.
- Use the Graph Analyzer's exact Hamiltonian cycle algorithm to verify this.
- Adding edges must not break connectivity or 2-connectivity.

Verify all required properties before displaying the graph.

If generation fails, retry or return the verified base graph.

Never silently return an invalid research graph.

## 6.3 Theta Graph Generator

A theta graph consists of two distinguished vertices `u` and `v` connected by three internally vertex-disjoint paths.

Let the three path lengths, measured in edges, be `p`, `q`, and `r`.

The total number of vertices must be:

```text
n = p + q + r - 1
```

Requirements:

- Each path length must be at least 1.
- Total vertices must be between 6 and 16.
- At most one path can have length 1, since multiple length-1 paths would produce duplicate edges.
- The paths must share only their two endpoints.
- No duplicate edges or self-loops.
- Randomize vertex labels.
- Generate a clear visual arrangement of the three paths.

Allow users to configure `p`, `q`, and `r` on the setup screen.

Automatically calculate and display the total vertex count.

Validate all parameter combinations.

### Theta Graph Theorem

For theta graphs only, implement this classification from the research project's Theorem 4.

A theta graph is classified as snake-winnable if and only if:

1. At least one of `p`, `q`, `r` equals 1; OR
2. At least two of `p`, `q`, `r` equal 2.

Otherwise, it is classified as not snake-winnable.

Display the reason for the classification.

Do not apply this classification to arbitrary graphs.

---

# 7. Graph Visualization

Use dynamically generated SVG.

The graph must not be represented by a static image.

Every vertex and edge should come directly from the graph data structure.

## 7.1 Graph Layout

Implement a simple custom force-directed layout in JavaScript.

Include:

- Repulsive forces between vertices.
- Attractive forces between adjacent vertices.
- Boundary constraints.
- Collision avoidance.
- A fixed number of layout iterations.

Do not continuously recalculate the layout during the game.

For theta graphs, a specialized layout displaying three distinct paths between two endpoints is acceptable and preferable.

## 7.2 Vertex Styling

Represent vertices as circular nodes.

Use visually distinct appearances for:

| State | Appearance |
|---|---|
| Normal | Neutral |
| Snake head | Strong contrasting accent |
| Snake body | Snake-specific colour |
| Snake tail | Distinguishable snake colour |
| Apple | Red/orange |
| Selectable starting node | Highlighted |
| Selectable apple node | Highlighted |
| Legal next movement | Clearly highlighted |

Keep labels readable.

## 7.3 Edge Styling

- Draw edges behind nodes.
- Use clean lines.
- Keep edges visible in dense graphs.
- Avoid excessive overlap.

## 7.4 Interaction

Interaction depends on the game state.

**Starting vertex selection:**
- Apple Player can click any vertex.

**Apple placement:**
- Apple Player can click any unoccupied vertex.

**Human Snake movement:**
- Highlight all legal adjacent vertices.
- Allow one movement per click.
- Reject illegal selections.

**Computer movement:**
- Animate the movement.
- Disable manual graph interaction.

Add hover effects and visual feedback.

---

# 8. User Interface and Design

Build a polished, modern strategy-game interface.

The application should resemble a graph-theoretic strategy game rather than a conventional Snake clone.

Design requirements:

- Dark theme by default.
- Clean typography using system fonts.
- Restrained accent colours.
- Rounded panels.
- Consistent spacing.
- Subtle animations.
- Responsive layout.
- Clear hierarchy.
- Graph as the primary visual element.

Do not make the UI excessively decorative.

## 8.1 Home Screen

Display:

**Title:** Playing Snake on Graphs

**Subtitle:** A Graph-Theoretic Strategy Game

Include:

1. Human vs Human.
2. Human vs Computer.
3. Graph generation mode.
4. Vertex count selector (6–16) for applicable modes.
5. Graph density selector.
6. Optional random seed input.
7. Start Game button.

For Human vs Computer, show:

- Play as Snake.
- Play as Apple.

For Theta Graph mode, show `p`, `q`, and `r` input fields instead of the ordinary vertex count selector.

Show the calculated total number of vertices and validate inputs immediately.

Only show settings relevant to the currently selected graph mode.

## 8.2 Game Screen

Use a three-section layout.

### A. Graph Board

- Display the generated SVG graph.
- Keep it centered.
- Make it responsive.
- Use available screen space efficiently.

### B. Game Dashboard

Display:

- Current player.
- Current role.
- Snake length.
- Total vertices.
- Unoccupied vertices.
- Number of apples eaten.
- Current apple position.
- Moves used for current apple.
- Maximum moves permitted.
- Graph generation mode.
- Random seed.

Clearly indicate whose turn it is.

### C. Game Controls

Include:

- Pause / Resume.
- Restart Match.
- Generate New Graph.
- Graph Properties.
- Move History.
- Return to Home.

All controls must be functional.

Pausing must prevent both human and computer actions. Resuming must continue from the exact previous game state.

## 8.3 Move History

Provide a collapsible move-history panel.

Record:

- Initial starting vertex.
- Every apple placement.
- Every snake movement.
- Every apple eaten.
- Snake length after each apple.
- Movement-limit losses.
- Collision-related losses.
- Final result.

Use event numbers and visually distinguish event types.

## 8.4 End-Game Screen

Display:

- Snake Player Wins OR Apple Player Wins.
- Final snake length.
- Total vertices.
- Apples eaten.
- Total snake movements.
- Graph type.
- Random seed.
- Reason for the result.

Provide:

1. Play Again on Same Graph.
2. Swap Roles and Replay (Human vs Human).
3. Generate New Graph.
4. Return to Home.

All replay operations must reset the relevant game state and cancel pending AI actions.

---

# 9. Graph Analysis

Include a Graph Properties panel or modal.

Implement these algorithms:

### Basic properties
1. Vertex count.
2. Edge count.
3. Degree of every vertex.
4. Minimum degree.
5. Maximum degree.
6. Graph density.
7. Connectedness.

### Advanced properties
8. Articulation point detection using Tarjan's algorithm.
9. 2-vertex-connectivity.
10. Hamiltonian path existence.
11. Hamiltonian cycle existence.

Since the maximum graph size is 16 vertices, use bitmask dynamic programming for exact Hamiltonian path/cycle detection.

Do not use unnecessarily expensive brute-force enumeration.

For Hamiltonian path detection, maintain a bitmask of possible endpoints for every visited vertex subset.

For Hamiltonian cycle detection, fix a starting vertex, perform subset DP, and check whether a full-graph path can return to the starting vertex.

Return exact Boolean results.

## 9.1 Research-Based Observations

Include a separate section titled **Research-Based Observations**.

Implement the following results from the research project:

**Result 1: Hamiltonian cycle**

A graph containing a Hamiltonian cycle is classified as snake-winnable.

**Result 2: No Hamiltonian path**

A graph without a Hamiltonian path is classified as not snake-winnable.

**Result 3: Vertex of degree 1**

A graph containing a vertex with degree 1 is classified as not snake-winnable.

**Result 4: Theta graph**

Apply the previously specified Theorem 4 classification only to theta graphs.

Display explanatory messages, for example:

- "Hamiltonian cycle found: The research classifies this graph as snake-winnable."
- "No Hamiltonian path found: The research classifies this graph as not snake-winnable."
- "Vertex of degree 1 found: The research classifies this graph as not snake-winnable."
- "Theta graph classification: Theorem 4 classifies this graph as snake-winnable/not snake-winnable."
- "No classification from the implemented research results applies to this graph."

Important:

- Do not classify an arbitrary graph as snake-winnable merely because it has a Hamiltonian path.
- Do not assume 2-connectivity guarantees snake-winnability.
- Do not apply theta-specific results to other graphs.
- The movement limit `2 * n` is a gameplay rule, not a theorem from the research.
- Keep theoretical observations separate from the outcome of an individual game.
- Never present a game result as a mathematical proof.

---

# 10. JavaScript Code Organization

Keep all JavaScript inside `scripts.js`.

Organize it into clearly separated logical sections:

1. Configuration and constants.
2. Seeded random number generator.
3. Graph generator.
4. Graph analyzer.
5. Game state.
6. Game engine.
7. Snake AI.
8. Apple AI.
9. Graph renderer.
10. Dashboard and move history.
11. UI controller.
12. Application initialization.
13. Self-tests.

Suggested classes:

- `GraphGenerator`
- `GraphAnalyzer`
- `GameState`
- `GameEngine`
- `SnakeAI`
- `AppleAI`
- `GraphRenderer`
- `Dashboard`
- `HistoryManager`
- `UIController`

These classes should exist within the single JavaScript file. Do not create separate files.

Use clear method names, avoid excessive code duplication, and keep responsibilities separate.

---

# 11. Game State Machine

Use an explicit state machine.

Suggested states:

```text
SETUP
SELECT_START
PLACE_APPLE
SNAKE_MOVE
PAUSED
GAME_OVER
```

Expected flow:

```text
SETUP
  |
  v
SELECT_START
  |
  v
PLACE_APPLE
  |
  v
SNAKE_MOVE
  |
  +---- Apple not eaten ----> SNAKE_MOVE
  |
  +---- Apple eaten --------> PLACE_APPLE
  |
  +---- Snake wins --------> GAME_OVER
  |
  +---- Apple wins --------> GAME_OVER
```

Pause and resume must preserve the previous active state.

Validate every action against the current game state.

Prevent:

- Apple placement during the snake's turn.
- Snake movement during the apple's turn.
- Any action during pause.
- Any interaction after game termination.
- Human interaction during computer movement.

---

# 12. Seeded Randomness

Implement a deterministic pseudorandom number generator such as Mulberry32.

Requirements:

1. Provide an optional random seed on the setup screen.
2. Generate a seed automatically if none is provided.
3. Display the seed throughout the match.
4. Use seeded randomness for graph generation.
5. Use seeded randomness for random Apple AI decisions.
6. The same seed and configuration must produce the same initial graph.
7. Replaying the same actions with the same seed must reproduce the same random AI decisions.

Use separate random streams for graph generation and AI decisions where appropriate, so graph layout does not unexpectedly change gameplay randomness.

The seed must appear in the match history and end-game statistics.

---

# 13. Edge Cases and Correctness

Explicitly handle:

1. Invalid starting vertex selections.
2. Apple placement on occupied vertices.
3. Movement to non-adjacent vertices.
4. Movement into the snake's body.
5. Movement into the current tail when not growing.
6. Incorrect growth after eating an apple.
7. Snake filling the entire graph.
8. Snake having no legal moves.
9. Movement limit reached exactly.
10. Apple eaten on the final permitted move.
11. Movement counter reset after apple placement.
12. BFS failing to find a path when legal moves still exist.
13. AI actions executing after game termination.
14. AI actions executing after pause.
15. AI actions executing after restart.
16. Old state remaining after new graph generation.
17. Invalid theta path length combinations.
18. Invalid Research Challenge graph generation.
19. Vertex labels and edges overlapping excessively.
20. Rapid repeated clicks causing multiple movements.

Use cancellation tokens or equivalent timer management to ensure stale computer actions cannot execute after a pause, restart, new graph or game termination.

All state transitions must be consistent and atomic.

---

# 14. Testing Requirements

Implement an internal test suite.

It must be accessible in the browser developer console using:

```javascript
SnakeGraphGame.runSelfTests();
```

The test suite should not corrupt an active match.

Test:

### Graph generation
- General random graphs are connected.
- No self-loops or duplicate edges.
- Every graph is undirected.
- Research Challenge graphs have 2-connectivity.
- Research Challenge graphs have Hamiltonian paths.
- Research Challenge graphs have no Hamiltonian cycles.
- Theta graphs have three internally vertex-disjoint paths.
- Theta graph vertex counts match `p + q + r - 1`.

### Graph analysis
- Connectivity checks.
- Articulation point detection.
- 2-connectivity.
- Hamiltonian path detection.
- Hamiltonian cycle detection.
- Theta classification for all specified cases.

### Game engine
- Initial snake length equals 1.
- Starting position is not counted as an apple eaten.
- Apple placement only accepts unoccupied vertices.
- Movement only follows existing edges.
- Illegal movement is rejected.
- Tail collision rules work correctly.
- Apple consumption increases length by exactly one.
- Snake victory is correctly detected.
- Movement counter resets.
- Movement limit is enforced at exactly `2 * n`.

### AI
- Random Apple always selects a valid vertex.
- BFS finds shortest paths on known test graphs.
- BFS avoids occupied vertices.
- Tail handling works correctly.
- BFS is recalculated after every movement.
- AI fallback never executes an illegal move.

### UI and controls
- Pause prevents all game actions.
- Resume restores the previous state.
- Restart cancels pending AI movements.
- Graph regeneration clears previous state.
- No actions execute after game termination.

Use assertions and provide readable test results.

Fix errors discovered during testing.

---

# 15. Implementation Workflow

Work directly in the current working directory.

Follow this sequence:

**Step 1 — Inspect**

Inspect the current directory and identify whether any of the three target files already exist. Preserve unrelated files.

**Step 2 — Implement**

Create or update exactly:

- `index.html`
- `styles.css`
- `scripts.js`

Implement the complete application rather than creating a static mockup.

**Step 3 — Verify**

Review the three files together.

Check:
- All HTML element IDs referenced in JavaScript exist.
- All event listeners are connected.
- No JavaScript syntax errors.
- Game state transitions are correct.
- Snake movement and tail handling are correct.
- BFS works correctly.
- Graph algorithms work correctly.
- All interface controls work.
- Timers are cancelled correctly.
- Offline execution works.

If Node.js is already available, you may use `node --check scripts.js` as an additional syntax check. Do not install Node.js, npm packages or any external tooling.

Run the browser-based self-tests where possible. Do not claim that browser interaction tests were performed if they were not.

**Step 4 — Polish**

Improve the UI and fix any visible or functional issues discovered during implementation.

Do not stop after creating a basic prototype.

**Step 5 — Report**

At the end, summarize:
- Files created or updated.
- Features implemented.
- Tests executed and their results.
- Any limitations that remain.

---

# 16. Final Acceptance Criteria

The application is complete only when:

- Human vs Human is playable from start to finish.
- Human vs Computer is playable in both role configurations.
- Apple Player selects the snake's initial position.
- Apple placement works correctly.
- Snake movement and growth work correctly.
- The movement limit works correctly.
- Random Apple AI works.
- BFS Snake AI works.
- General Random graph generation works.
- Research Challenge graph generation works.
- Theta graph generation works.
- SVG graph interactions work.
- Graph analysis displays correct results.
- Research-based observations are correctly applied.
- Move history works.
- Pause, resume, restart and replay work.
- No stale AI actions occur.
- Seed reproducibility works.
- The application runs offline without installation.
- All three files work together.

**Final instruction:** Prioritize correctness, readability and reliability over unnecessary complexity. Build a complete playable application, not a visual demonstration. Do not leave placeholder functions, TODOs, pseudocode or mocked game mechanics. Do not create files beyond the three specified files.