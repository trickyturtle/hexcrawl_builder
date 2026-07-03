# Hexcrawl World Builder — Project Brief

This document is the full design spec for a procedural hexcrawl map generation and reference tool. Read it fully before writing any code.

---

## What This Is

A standalone desktop web app (React + Vite) for procedurally generating hexcrawl maps from RPG module data and user-defined parameters. The map is the primary interface, used as a live reference tool during tabletop RPG sessions. It is not a game — it is a GM tool.

---

## Core Concepts

### Modules
A **module** is a data container — a structured profile of an RPG adventure module. It is not a thing that exists on the map. It is a source of world entities (locations, factions, NPCs, etc.) and placement constraints. The module itself is just provenance metadata once its entities are placed.

- Modules are added in **batches**. The constraint solver processes all modules in a batch simultaneously before placing anything — never greedily one at a time.
- **Revert operates at the batch level.** Adding modules is atomic per batch. A user can undo the entire last batch but not individual modules within it.
- A user may add any number of modules at any time. Adding all modules at once and adding them incrementally over time are both valid workflows.
- Modules have a **source field** and entities derived from them track which module(s) they came from.
- Entities have **stable internal UUIDs** separate from display names so they can be renamed freely.
- An **entity merging / aliasing system** (planned for later) will allow entities from different modules to be declared the same entity, merging their data and flagging conflicts for user resolution.

### Entities
Everything that exists in the world is an **Entity**. Entities can be defined at the module level (sourced from a module) or at the map level (user-defined globally).

**Base entity fields:**
- `id` — stable UUID
- `name` — display name (can be changed freely)
- `description` — free text
- `subclass` — see subclasses below
- `sources` — array of module IDs this entity came from
- `obsidianLink` — optional path to an Obsidian vault note
- `pdfReference` — optional `{ file, page }` for module PDF
- `relationships` — array (see Relationships below)
- `locationRequirements` — terrain/biome/climate constraints for map placement (see below)
- `tags` — free-form array of strings

**Entity subclasses:**
- `Location` — a named place. Has a hex footprint (single hex or multi-hex). Has terrain type.
- `Faction` — a group with agency. Has territory tendency (concentrated vs. diffuse), home base location.
- `Nation` — subclass of Faction. Adds formal territory claims, diplomatic status fields.
- `Religion` — first-class entity. Many-to-many with all other entities. A nation/faction/location can have multiple religions. A religion can span multiple factions/nations.
- `NPC` — a named individual. Associated with factions, locations.
- `GeographicFeature` — a named terrain feature (mountain range, river, etc.).
- `Event` — a historical or in-progress event. Has a timeline position.
- More subclasses can be added later.

### Relationships
Relationships between entities are expressive and directional.

**Relationship fields:**
- `fromEntityId`
- `toEntityId`
- `label` — free text (e.g. "trade agreement", "ancient rivalry", "religious schism")
- `description` — free text for nuance
- `directionality` — `one-way` or `bidirectional` (A's attitude toward B ≠ B's attitude toward A)
- `impliesSpatialAccess` — boolean (does this relationship require geographic access between entities?)
- `accessType` — `land`, `sea`, `either`, `none`
- `distanceConstraint` — optional `{ min, max, unit: 'hexes' }`
- `distanceIsHard` — boolean (hard constraint vs. soft preference)
- `isPublicKnowledge` — boolean
- `spatialException` — free text (e.g. "exiled — deliberately separated", "historical only")

**Spatial access implication by relationship type (defaults, overridable):**
- Trade agreement → implies access (land or sea)
- Political vassalage → implies close proximity
- Military alliance → implies close enough to reinforce
- Cultural tension → implies proximity
- Exile → spatial exception, no access required
- Ancient enmity → historical, no current access required
- Religion spread → soft proximity along trade routes

### Location Requirements (on any Entity)
Every entity can declare placement constraints:

- `terrainAffinity` — required or preferred terrain types
- `biomeRequirements` — e.g. coastal, cold, arid, forested, underground
- `elevationRequirements` — mountain, lowland, underground, etc.
- `proximityRequirements` — array of `{ entityId, minHexes, maxHexes, isHard }`
- All constraints are marked `required` (hard) or `preferred` (soft)

---

## Map Parameters

All parameters are optional unless noted.

- `hexCount` — total number of hexes (supports up to 1000, typical 200-300)
- `dimensions` — alternative to hexCount: `{ width, height }` in hex columns/rows
- `hexSizeMiles` — size of each hex in miles (system presets available)
- `mapShape` — `rectangle`, `circular`, `continent`, `island`, `irregular`
- `travelSpeedAssumptions` — from system preset or manual override
- `settlementDensity` — `low`, `medium`, `high`
- `politicalFragmentation` — `unified`, `fragmented`, `tribal`, `none`
- `dangerDistribution` — `even`, `concentrated`, `peripheral`, `random`
- `magicDensity` — `none`, `low`, `medium`, `high`, `wild`
- `ageOfWorld` — `young`, `mature`, `ancient`, `post-apocalyptic` (affects ruin density, lost civs)
- `weirndessFactor` — 0-10 scale, affects strictness of biome adjacency rules
- `biomeDistribution` — preferred coverage percentages per biome type
- `systemPreset` — one of the built-in system presets

**System Presets** (built-in, expandable):
- OSR: 6-mile hexes, 24 miles/day road, 18 cross-country, 12 forest/hills
- D&D 5e: 6-mile hexes, standard PHB travel speeds
- Custom: manual entry

---

## Module Profile Schema

All fields optional except `name`.

- `name` — string
- `system` — string (e.g. "OSR", "D&D 5e", "OSRIC")
- `sourceFile` — path or filename of PDF
- `pdfStartPage` — number
- `footprint` — `single` or `sprawling`
- `localeCount` — if sprawling, how many distinct areas
- `explicitDistances` — array of `{ fromLabel, toLabel, distance, unit }` — converted to hexes using system preset
- `entryPoints` — array of location entity IDs flagged as entry points
- `toneKeywords` — array of strings (e.g. "horror", "dungeon crawl", "political intrigue")
- `difficulty` — `low`, `medium`, `high`, `varies`
- `moduleRelationships` — explicit relationships to other modules by name/ID
- `entities` — array of Entity objects sourced from this module
- `obsidianNote` — optional vault link
- `notes` — free text

---

## Map Interface (Primary UI)

The map is the main view. It must be interactive, performant at 1000 hexes, and usable during live play.

**Hex grid:**
- SVG-based hex grid
- Honeycomb.js for hex math (offset coordinates, neighbor finding, distance, pathfinding)
- Click a hex to open the hex detail panel
- Pan (drag) and zoom (scroll wheel)
- Each hex stores: terrain type, biome, entities present (by ID), fog of war state, event history

**Hex detail panel:**
- Shows all notable entities in the clicked hex
- Each entity with additional info has a hyperlink
- Hyperlinks open an entity detail view
- Entity detail view shows all fields + relationships, each relationship target is also a hyperlink
- Module references show module name + page number
- Obsidian links open via `obsidian://open?vault=...&file=...` URI scheme
- PDF references open the PDF at the specified page if possible

**Overlays (toggleable):**
- Terrain / biome
- Faction territories
- Nation borders
- Religion spread
- Danger level
- Magic density
- Fog of war
- Module footprints (which hexes belong to which module batch)
- Trade routes / access paths

**Fog of war:**
- Optional, toggled per map
- Three hex states: `unknown` (fully hidden), `explored` (terrain visible, details hidden), `known` (fully revealed)
- GM can reveal hexes individually or by radius

**Dynamic map / temporal layer:**
- Hexes and entities have an event history log
- GM can record in-game events that modify hex state (faction takes territory, location destroyed, etc.)
- Season system: map can reflect current season, affecting certain terrain types and travel speeds
- Changes are logged with timestamps for reference

---

## Data Architecture

**All data is stored as JSON files.** No database.

- `world.json` — top-level map parameters, system preset, metadata
- `hexes.json` — array of hex objects (terrain, entities, fog state, event log)
- `entities.json` — all entities indexed by UUID
- `modules.json` — all module profiles
- `batches.json` — history of module batches added, used for batch-level revert
- `presets.json` — system presets

**File System Access API** for reading/writing JSON files in the browser without Electron. Electron wrapper can be added later without changing the codebase.

**Obsidian integration:**
- User points app at their vault directory
- App indexes all `.md` files and resolves `[[wikilinks]]`
- Entity obsidian links render inline or open via URI scheme
- App can optionally write new entity notes back to vault

---

## Constraint Solver (Generation Engine)

The solver runs when a batch of modules is committed. It must:

1. Extract all entities and their placement constraints from the batch
2. Consider existing map state as hard constraints (already-placed entities cannot move)
3. Solve placement for all new entities simultaneously (not greedily)
4. Respect hard constraints absolutely; optimize for soft constraints
5. Propagate terrain/biome outward from placed entities to neighboring hexes
6. Infer and place trade routes / access paths implied by relationships
7. Fill remaining hexes with terrain using biome distribution parameters
8. If no valid solution exists, surface conflicts to the user rather than making bad placements

**Algorithm approach:** weighted constraint satisfaction with backtracking. Score candidate placements by soft constraint satisfaction, backtrack on hard constraint violations.

**Biome adjacency rules** (strictness modulated by `weirndesseFactor`):
- Cold biomes do not border hot/arid biomes without transition
- Coastal biomes require actual coastline (ocean hexes)
- Mountain biomes cluster
- Underground biomes are independent of surface
- At high weirdness, adjacency rules can be broken with a flagged "dimensional anomaly" marker

---

## Project Structure

```
hexcrawl-builder/
├── CLAUDE.md                  # This file
├── package.json
├── vite.config.js
├── index.html
└── src/
    ├── main.jsx
    ├── App.jsx
    ├── components/
    │   ├── map/
    │   │   ├── HexGrid.jsx        # Main SVG hex grid
    │   │   ├── HexCell.jsx        # Individual hex rendering
    │   │   ├── HexOverlay.jsx     # Overlay layer system
    │   │   ├── FogOfWar.jsx       # Fog state rendering
    │   │   └── MapControls.jsx    # Pan/zoom controls, overlay toggles
    │   ├── panels/
    │   │   ├── HexDetailPanel.jsx # Clicked hex info + entity list
    │   │   ├── EntityDetail.jsx   # Entity info + hyperlinked relationships
    │   │   └── Sidebar.jsx        # Collapsible sidebar wrapper
    │   ├── forms/
    │   │   ├── ModuleForm.jsx     # Module profile input
    │   │   ├── EntityForm.jsx     # Entity creation/editing
    │   │   ├── MapSetupForm.jsx   # World parameters
    │   │   └── BatchManager.jsx   # Module batch management + revert
    │   └── ui/
    │       ├── HyperlinkText.jsx  # Renders text with entity/obsidian/pdf links
    │       ├── EntityBadge.jsx    # Small entity type indicator
    │       └── OverlayToggle.jsx  # Toggle buttons for map overlays
    ├── engine/
    │   ├── solver/
    │   │   ├── constraintSolver.js    # Main placement solver
    │   │   ├── biomeRules.js          # Biome adjacency rules
    │   │   ├── spatialInference.js    # Relationship → spatial constraint inference
    │   │   └── scoring.js            # Soft constraint scoring
    │   ├── generator/
    │   │   ├── terrainGenerator.js    # Terrain/biome propagation
    │   │   ├── routeGenerator.js      # Trade route / access path generation
    │   │   └── hexGrid.js             # Honeycomb.js wrapper + hex math utilities
    │   └── entities/
    │       ├── entitySchema.js        # Entity base class + subclass definitions
    │       ├── relationshipSchema.js  # Relationship type definitions
    │       └── moduleParser.js        # Module profile → entity extraction
    ├── store/
    │   ├── worldStore.js      # Zustand store: map parameters, system preset
    │   ├── hexStore.js        # Zustand store: hex grid state
    │   ├── entityStore.js     # Zustand store: all entities indexed by UUID
    │   ├── moduleStore.js     # Zustand store: module profiles + batch history
    │   └── uiStore.js         # Zustand store: UI state (selected hex, overlays, fog)
    └── data/
        ├── presets/
        │   └── systemPresets.js   # OSR, 5e, etc. travel speed + hex size presets
        └── schemas/
            └── defaultSchemas.js  # Default field values for all entity types
```

---

## Tech Stack

- **Vite** — build tool
- **React** — UI framework
- **Zustand** — global state management
- **Honeycomb.js** — hex grid math
- **SVG** — hex map rendering (not canvas)
- **Tailwind CSS** — styling
- **File System Access API** — local JSON file read/write
- No backend. No database. Everything is local files.

---

## Build Order

Build in this sequence:

1. **Vite + React scaffold** with Tailwind and Zustand
2. **Hex grid rendering** — SVG hex grid, pan/zoom, click handling, basic terrain coloring
3. **Data stores** — world, hex, entity, module stores with JSON save/load
4. **Hex detail panel** — click a hex, see what's in it
5. **Entity system** — entity schema, entity detail view, hyperlink navigation
6. **Map setup form** — world parameters, system preset selection
7. **Module form** — module profile input, entity creation within a module
8. **Constraint solver** — placement engine, biome propagation, batch commit/revert
9. **Overlays** — faction territories, fog of war, trade routes, etc.
10. **Obsidian integration** — vault indexing, wikilink resolution, URI opening
11. **Dynamic map** — event logging, season system, temporal changes

---

## Design Notes

- The map is used during live play — performance and clarity matter more than visual complexity
- Most parameters are optional — the tool should work with minimal input and improve with more
- Surface conflicts and ambiguities to the user rather than silently making bad decisions
- Entities have stable UUIDs; display names can change freely without breaking references
- The constraint solver should fail loudly (tell the user what conflicted) not silently (place things badly)
- Obsidian integration is additive — the tool works fully without it

---

## Design Decisions & Rationale

This section explains the *why* behind key decisions. Read this before making architectural changes.

### Why modules are data containers, not map objects
Early in design there was a temptation to treat modules as first-class map entities — pins on the map representing "the module lives here." This was rejected because a module is a real-world artifact (a published adventure), not a fictional thing that exists in the game world. A module might describe a mountain, a faction, and a dungeon — those things exist in the world, but the module itself doesn't. Treating modules as map objects would create confusion between the real world (GM prep) and the game world (what players experience). Modules are purely provenance metadata. Once their entities are placed, the module is just a source tag.

### Why batch atomicity, not per-module revert
The naive approach is to add modules one at a time and allow reverting individual module additions. This was rejected because of a fundamental constraint satisfaction problem: if you place module A, then surround it with modules B through Y, and then discover that module Z must be geographically close to A but requires an incompatible biome, you're stuck. The system painted itself into a corner by placing greedily. Batch atomicity forces the solver to find a solution that works for ALL modules in the batch simultaneously, preventing this. Revert at the batch level gives an escape hatch if the result is wrong, without implying false precision about which individual module caused the problem.

### Why Nation is a subclass of Faction, not a separate entity type
Nations and factions share almost all the same properties: they have territory, relationships, goals, home bases, and cultural identity. Nations just add formal elements like territory claims and diplomatic status. Making Nation a separate top-level type would mean duplicating all faction relationship logic. The distinction between a nation and a powerful faction is often fuzzy in fantasy settings anyway — a merchant guild controlling a city-state is functionally a nation. Inheritance is the right model here.

### Why Religion is a first-class entity, not a faction subclass
Unlike nations, religions behave differently from factions in one critical way: they are many-to-many with everything. A faction can have one home base (generally), but a religion can exist across dozens of locations, factions, and nations simultaneously without any of them "owning" it. Religions also spread differently — along trade routes, through conquest, through cultural diffusion — rather than having a single territory. Making religion a faction subclass would force awkward modeling of this spread behavior. It's its own thing.

### Why relationships are freeform, not an enum
Early designs considered a fixed enum of relationship types (ally, rival, neutral, vassal, etc.). This was rejected because real faction relationships in RPG settings are almost always more complex and specific than any enum can capture. A faction might be "formally allied but secretly undermining," or "rivals in trade but united against a common enemy," or "the remnant of a civilization that the other faction destroyed and feels guilty about." These need free text labels and descriptions. The spatial implication system (does this relationship require geographic access?) uses soft defaults per relationship type, which can be overridden — this gives structure without being prescriptive.

### Why relationships have directionality
Faction A's attitude toward Faction B is not necessarily the same as B's attitude toward A. A conquered people may consider themselves subjects of an empire while the empire considers them a province. A cult may consider a church its parent religion while the church considers the cult heretical. If relationships were always bidirectional, you'd lose this nuance. Every relationship can be declared one-way or bidirectional, and the description field can capture the asymmetry in detail.

### Why "transition hexes" is not a feature
An early concept called for the system to generate descriptive "transition content" between modules of different tones (e.g. traveling from a Gothic horror module to a pirate adventure module). This was simplified to just geographic coherence — the terrain around modules should make sense (a coastal module needs actual coastline, a cold module needs to be in a cold region). The generative prose per hex comes entirely from the user's existing random tables, not from the system. This keeps the system's scope focused on geography and entity placement rather than content generation.

### Why the constraint solver fails loudly
When no valid placement exists for a batch of modules, the temptation is to make the best bad placement and let the user figure it out. This was explicitly rejected. A bad silent placement is worse than no placement — the GM might not notice until mid-campaign that a coastal faction was placed inland, or that two supposedly distant factions ended up neighboring. The solver should identify which constraints are in conflict, explain them clearly, and ask the user to resolve them (relax a constraint, remove a module from the batch, adjust parameters) rather than silently producing a broken world.

### Why the user's existing random tables handle hex content
The system generates the structure of the world (terrain, entity placement, faction territories, geographic features) but does not generate the narrative content of individual hexes. The user already has random tables for this (encounter tables, location description tables, etc.) that are tuned to their preferred system and setting. Building a parallel content generation system would duplicate that work and likely produce inferior results. The hex detail panel surfaces entities and module references; the GM uses their tables for everything else.

### Why Obsidian integration is optional and additive
Many GMs don't use Obsidian. Building the tool to require it would exclude them. The tool stores everything in its own JSON format, which is the source of truth. Obsidian is just a linked view — if the user has a vault, entity links can open notes there; if not, entity detail is shown inline. This also means the tool works offline and without any external dependencies.

### Why SVG over canvas for the hex grid
At up to 1000 hexes, SVG is perfectly performant and offers major advantages: individual hex elements are DOM nodes that can receive click events natively, CSS can style them, overlays can be separate SVG layers, and debugging is much easier (you can inspect elements). Canvas would require manual hit-testing for clicks, manual layer compositing, and manual re-renders. The only case for canvas would be if performance at 1000 hexes became a real problem, which should be validated before switching.

### Why explicit distances from module text get converted to hexes
Modules sometimes state explicit distances ("the dark elf city is three days' travel from the dungeon entrance"). These are valuable placement constraints that should not be ignored. The conversion to hexes requires knowing the system's travel speed assumptions (which vary by system and terrain), which is why system presets exist. A "day's travel" in OSR (18 miles cross-country = 3 hexes at 6-mile scale) is different from 5e. The system preset handles this conversion automatically so the user doesn't have to do the math.

### On the planned entity merging / aliasing system
A user with many unrelated modules will often find that two modules describe similar or identical factions (two different dwarven mining clans, two different thieves' guilds). Rather than forcing these to exist as separate entities on the map, the merging system will allow declaring them the same entity. The alias approach (map one name to another without fully resolving conflicts) is preferred over hard merging because conflicts (module A says the dwarves are isolationist, module B says they're traders) should be surfaced to the user, not silently resolved. This is deferred to the module import tool (a separate future tool that scans PDFs and generates module profiles), not the core map tool. The core data schema already supports it via the `sources` array on entities.
