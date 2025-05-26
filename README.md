# Minesweeper Solver

This project is an automated solver for the Minesweeper game hosted at [https://minesweeper.online/start/1](https://minesweeper.online/start/1). It uses Puppeteer to interact with the game in a browser, analyze the board state, and make moves based on deterministic rules or random safe guesses. The solver detects mines, flags potential mine locations, and reveals safe cells until the game is won or a mine is hit.

## Features

- **Automated Gameplay**: Navigates to the Minesweeper game, clicks the center cell to start, and plays until completion or game over.
- **Board State Parsing**: Interprets the game board using DOM selectors (`hdd_opened`, `hdd_typeX`, `hdd_flag`) and `cell_[col]_[row]` IDs (e.g., `cell_2_0` for column 2, row 0).
- **Mine Detection**: Identifies mines (`hdd_type10` as `M`, `hdd_type11` as `[M]` for clicked mines) and marks them in the board state.
- **Solving Logic**:
  - **Rule 1**: Flags unopened neighbors if their count equals the cell's value minus flagged neighbors.
  - **Rule 2**: Reveals unopened neighbors if the cell's value equals flagged neighbors.
  - **Rule 3**: Reveals a random unopened, unflagged cell near a revealed cell if no deterministic moves are available.
- **Debugging**: Logs raw cell data, board state, and saves screenshots (`debug_click_rowX_colY.png`) after each click.
- **Game Status**: Detects win (`hd_win`), loss (`hd_lose`, `hdd_lose`, or `gameover` class), or ongoing status.

## Prerequisites

- **Node.js**: Version 14 or higher (x64 recommended; arm64 may require Rosetta 2 for Chromium compatibility).
- **npm**: For installing dependencies.
- **Internet Connection**: To access the game website and download Puppeteer’s Chromium.

## Installation

1. **Clone the Repository** (or create a project directory):
   ```bash
   mkdir minesweeper-solver
   cd minesweeper-solver
   ```

2. **Create Project Files**:
   - Save `minesweeper_solver.ts`, `package.json`, and `tsconfig.json` in the project directory (provided separately).
   - Ensure `package.json` includes dependencies (`puppeteer`, `typescript`, `ts-node`).

3. **Install Dependencies**:
   ```bash
   npm install
   ```

4. **Verify Setup**:
   - Confirm Node.js is installed: `node -v`.
   - Check npm: `npm -v`.

## Usage

1. **Run the Solver**:
   - Compile and run the TypeScript code:
     ```bash
     npm start
     ```
   - Or run directly with `ts-node`:
     ```bash
     npm run start:ts-node
     ```

2. **Expected Output**:
   - The browser opens, navigates to https://minesweeper.online/start/1, and starts the game.
   - Console logs show:
     - Board dimensions (e.g., `Detected board dimensions: 9x9`).
     - Raw cell data (DOM classes like `hdd_opened`, `hdd_typeX`).
     - Board state (e.g., `1` for numbers, `F` for flags, `M` for mines, `[M]` for clicked mines).
     - Actions (e.g., `Flagging 2 neighbors at row 3, col 1`).
     - Game status (e.g., `Game status: lost`).
   - Screenshots are saved after each click (e.g., `debug_click_row4_col1.png`).
   - Example board state:
     ```
     Board state:
     M . . . . . . . .
     . . . . . . . . M
     M . . . . . M . .
     M . . . M . . . .
     . M . . 1 . . . .
     . . . . . . . . .
     . . . . M . . . .
     . . . . . . . . .
     M . [M] . . . . . .
     Game over: Mine hit after random reveal.
     Game status: lost
     ```

3. **Stopping the Solver**:
   - The solver stops when:
     - A mine is hit (`[M]` appears, `Game over: Mine hit`).
     - No safe moves remain (`No safe random moves available`).
     - The game is won (`Game status: won`).
   - The browser remains open for inspection (close manually or uncomment `await browser.close()`).

## Project Structure

- **`minesweeper_solver.ts`**: Main script with Puppeteer automation, board parsing, and solving logic.
- **`package.json`**: Defines dependencies (`puppeteer`, `typescript`, `ts-node`) and scripts (`start`, `start:ts-node`).
- **`tsconfig.json`**: Configures TypeScript compiler options.
- **`debug_click_rowX_colY.png`**: Screenshots generated after each click for debugging.

## Troubleshooting

1. **Flagging Loop**:
   - If the solver repeatedly flags a cell (e.g., `cell_1_4`), verify `hdd_flag` is detected in `Raw cell data:`:
     ```json
     {
       "id": "cell_1_4",
       "classes": ["cell", "size24", "hdd_flag", ...]
     }
     ```
   - Increase the delay in `clickCell` to `await delay(2000)`.

2. **DOM Update Timeout**:
   - If `DOM update timeout` warnings appear, check screenshots (e.g., `debug_click_row4_col1.png`) to confirm flags or revealed cells.
   - Inspect the cell’s DOM (e.g., `<div id="cell_1_4" class="cell size24 hdd_flag">`) and share classes if `hdd_flag` is missing.

3. **Incorrect Mine Display**:
   - If mines show incorrectly (`M` or `[M]`), check `Raw cell data:` for mine cells:
     ```json
     {
       "id": "cell_0_0",
       "classes": ["cell", "size24", "hdd_opened", "hdd_type11", ...]
     }
     ```
   - Regular mines should have `hdd_type10` (`M`), clicked mines `hdd_type11` (`[M]`).

4. **Game Status Issues**:
   - If `Game status: ongoing` after a mine hit, inspect `#smiley` and `#game` in DevTools. Share classes (e.g., `hd_lose`, `hdd_lose`, `gameover`).
   - Example DOM:
     ```html
     <div id="smiley" class="hd_lose"></div>
     <div id="game" class="gameover"></div>
     ```

5. **Browser or Navigation Errors**:
   - Ensure an internet connection and no anti-automation blocks.
   - Check Node.js architecture (`node -v`). On arm64, performance may degrade due to Rosetta 2.
   - Reinstall dependencies: `npm install`.

## Notes

- The solver uses a 9x9 beginner board (https://minesweeper.online/start/1). For other difficulties, update the URL in `minesweeper_solver.ts`.
- Random moves (Rule 3) prioritize cells near revealed ones to minimize mine hits, but losses are possible.
- Debugging logs and screenshots are verbose for transparency. Reduce logging or disable screenshots for faster execution.
- The browser runs in non-headless mode (`headless: false`) for visibility. Set `headless: true` for background execution.

## License

This project is unlicensed and provided as-is for educational purposes. Use responsibly and respect the terms of https://minesweeper.online.