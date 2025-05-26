import puppeteer, { Browser, Page } from 'puppeteer';

// Define interfaces for the board and cell states
interface Cell {
  revealed: boolean;
  flagged: boolean;
  value: number | null;
}

interface BoardState {
  board: Cell[][]; // board[row][col]
  width: number;  // Number of columns
  height: number; // Number of rows
  gameOver: boolean;
}

// Utility function to create a delay
const delay = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));

// Check Node.js architecture and warn if arm64
if (process.arch === 'arm64') {
  console.warn('WARNING: Running on arm64 Node.js with x64 Chromium may require Rosetta 2 translation, potentially impacting performance.');
}

(async () => {
  // Launch browser with Puppeteer's bundled x64 Chromium
  const browser: Browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page: Page = await browser.newPage();
  
  // Set user agent to avoid anti-automation detection
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  // Navigate to Minesweeper game
  console.log('Navigating to https://minesweeper.online/start/1...');
  await page.goto('https://minesweeper.online/start/1', { waitUntil: 'networkidle2' });

  // Wait for game board to load
  console.log('Waiting for game board (#game)...');
  await page.waitForSelector('#game', { timeout: 10000 }).catch(err => {
    console.error('Error: Game board (#game) not found:', err);
    process.exit(1);
  });

  // Ensure board is interactive
  console.log('Waiting for board to be interactive...');
  await page.waitForFunction('document.querySelector("#game").childElementCount > 0', { timeout: 10000 });

  // Function to get the game board state
  async function getBoardState(): Promise<BoardState> {
    await delay(1000);
    
    const state = await page.evaluate((): BoardState => {
      const game = document.querySelector('#game');
      if (!game) throw new Error('Game container not found');
      
      const cells = game.querySelectorAll('[id^="cell_"]');
      const board: Cell[][] = [];
      let width: number = 0;
      let height: number = 0;
      let gameOver: boolean = false;

      // Parse cell IDs (cell_col_row)
      const cellIds: string[] = Array.from(cells).map(cell => cell.id);
      const coords: [number, number][] = cellIds
        .filter(id => id.startsWith('cell_'))
        .map(id => {
          const [, col, row] = id.match(/cell_(\d+)_(\d+)/)!.map(Number);
          return [row, col]; // [row, col] for board indexing
        });
      
      if (coords.length === 0) throw new Error('No cells with valid IDs found');
      
      height = Math.max(...coords.map(([row]) => row)) + 1; // Rows
      width = Math.max(...coords.map(([_, col]) => col)) + 1; // Columns
      console.log(`Detected board dimensions: ${height}x${width}`);

      // Initialize empty board
      for (let row = 0; row < height; row++) {
        board[row] = Array(width).fill(null).map(() => ({ revealed: false, flagged: false, value: null }));
      }

      // Populate board state and log raw classes
      const cellData: { id: string, classes: string[] }[] = [];
      cells.forEach((cell: Element) => {
        const id = cell.id;
        if (!id.startsWith('cell_')) return;
        const [, col, row] = id.match(/cell_(\d+)_(\d+)/)!.map(Number);
        const classes = Array.from(cell.classList);
        cellData.push({ id, classes });

        const cellState: Cell = { revealed: false, flagged: false, value: null };

        if (classes.includes('hdd_opened')) {
          cellState.revealed = true;
          const valueClass = classes.find(cls => cls.startsWith('hdd_type'));
          if (valueClass) {
            const value = parseInt(valueClass.replace('hdd_type', ''));
            if (value === 10) {
              gameOver = true;
              cellState.value = -2; // Regular mine, displayed as M
            } else if (value === 11) {
              gameOver = true;
              cellState.value = -1; // Clicked mine, displayed as [M]
            } else {
              cellState.value = value;
            }
          } else {
            cellState.value = 0;
          }
        } else if (classes.includes('hdd_flag')) {
          cellState.flagged = true;
        }

        board[row][col] = cellState;
      });

      console.log('Raw cell data:', JSON.stringify(cellData, null, 2));
      return { board, width, height, gameOver };
    });

    console.log(`Retrieved board state: ${state.height}x${state.width}, Game over: ${state.gameOver}`);
    return state;
  }

  // Function to click a cell (left-click to reveal, right-click to flag)
  async function clickCell(page: Page, row: number, col: number, isRightClick: boolean = false): Promise<void> {
    const cellSelector = `#cell_${col}_${row}`; // cell_col_row
    console.log(`Attempting to ${isRightClick ? 'flag' : 'reveal'} cell at row ${row}, col ${col} (${cellSelector})`);
    
    const cell = await page.$(cellSelector);
    if (!cell) {
      console.error(`Failed to find cell at row ${row}, col ${col} (${cellSelector})`);
      return;
    }

    try {
      await page.click(cellSelector, { button: isRightClick ? 'right' : 'left' });
      console.log(`Click performed at row ${row}, col ${col} (${isRightClick ? 'flagged' : 'revealed'})`);
    } catch (err) {
      console.warn(`Click failed, trying mouse click: ${err}`);
      const boundingBox = await cell.boundingBox();
      if (!boundingBox) {
        console.error(`No bounding box for cell at row ${row}, col ${col}`);
        return;
      }
      const x = boundingBox.x + boundingBox.width / 2;
      const y = boundingBox.y + boundingBox.height / 2;
      await page.mouse.click(x, y, { button: isRightClick ? 'right' : 'left' });
    }

    // Retry mechanism for DOM update
    let retries = 3;
    while (retries--) {
      try {
        await page.waitForFunction(
          (selector) => {
            const cell = document.querySelector(selector) as HTMLElement;
            return cell && (cell.classList.contains('hdd_opened') || cell.classList.contains('hdd_flag'));
          },
          { timeout: 10000 },
          cellSelector
        );
        break;
      } catch {
        console.warn(`DOM update timeout (retry ${3 - retries}/3), retrying...`);
        await delay(1000);
      }
    }
    if (retries < 0) {
      console.warn('DOM update failed after retries, proceeding...');
    }
    
    await delay(1000);
    console.log(`Completed click attempt for cell at row ${row}, col ${col} (${isRightClick ? 'flagged' : 'revealed'})`);
  }

  // Function to print board state
  async function printBoardState(board: Cell[][], width: number, height: number): Promise<void> {
    console.log('Board state:');
    for (let row = 0; row < height; row++) {
      let rowState = '';
      for (let col = 0; col < width; col++) {
        const cell = board[row][col];
        if (cell.flagged) rowState += 'F ';
        else if (!cell.revealed) rowState += '. ';
        else if (cell.value === 0) rowState += '0 ';
        else if (cell.value === -1) rowState += '[M] '; // Clicked mine
        else if (cell.value === -2) rowState += 'M '; // Regular mine
        else rowState += `${cell.value} `;
      }
      console.log(rowState);
    }
  }

  async function solveStep(): Promise<boolean> {
    let { board, width, height, gameOver }: BoardState = await getBoardState();
    
    // Print board state before checking game over
    await printBoardState(board, width, height);

    if (gameOver) {
      console.log('Game over: Mine hit (marked as [M]).');
      return false;
    }

    let actionTaken: boolean = false;

    console.log('Analyzing board for solvable moves...');
    for (let row = 0; row < height; row++) {
      for (let col = 0; col < width; col++) {
        const cell: Cell = board[row][col];
        if (!cell.revealed || cell.value === null || cell.value === 0 || cell.value === -1 || cell.value === -2) continue;

        // Count neighbors
        let unopenedNeighbors: number = 0;
        let flaggedNeighbors: number = 0;
        const neighbors: [number, number][] = [];

        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            if (dr === 0 && dc === 0) continue;
            const nr = row + dr;
            const nc = col + dc;
            if (nr >= 0 && nr < height && nc >= 0 && nc < width) {
              const neighbor: Cell = board[nr][nc];
              if (!neighbor.revealed && !neighbor.flagged) {
                unopenedNeighbors++;
                neighbors.push([nr, nc]);
              } else if (neighbor.flagged) {
                flaggedNeighbors++;
              }
            }
          }
        }

        // Rule 1: Flag unopened neighbors if they equal cell value minus flagged neighbors
        if (unopenedNeighbors > 0 && unopenedNeighbors === cell.value - flaggedNeighbors) {
          console.log(`Flagging ${unopenedNeighbors} neighbors at row ${row}, col ${col} (value: ${cell.value})`);
          for (const [nr, nc] of neighbors) {
            if (board[nr][nc].flagged) {
              console.log(`Skipping already flagged cell at row ${nr}, col ${nc}`);
              continue;
            }
            await clickCell(page, nr, nc, true);
            const newState = await getBoardState();
            board = newState.board;
            width = newState.width;
            height = newState.height;
            gameOver = newState.gameOver;
            await printBoardState(board, width, height);
            if (gameOver) {
              console.log('Game over: Mine hit after flagging.');
              return false;
            }
            actionTaken = true;
          }
        }

        // Rule 2: Reveal unopened neighbors if cell value equals flagged neighbors
        if (unopenedNeighbors > 0 && cell.value === flaggedNeighbors) {
          console.log(`Revealing ${unopenedNeighbors} neighbors at row ${row}, col ${col} (value: ${cell.value})`);
          for (const [nr, nc] of neighbors) {
            await clickCell(page, nr, nc, false);
            const newState = await getBoardState();
            board = newState.board;
            width = newState.width;
            height = newState.height;
            gameOver = newState.gameOver;
            await printBoardState(board, width, height);
            if (gameOver) {
              console.log('Game over: Mine hit after revealing.');
              return false;
            }
            actionTaken = true;
          }
        }
      }
    }

    // Rule 3: Reveal a random unopened, unflagged cell near a revealed cell
    if (!actionTaken) {
      const candidates: [number, number][] = [];
      for (let row = 0; row < height; row++) {
        for (let col = 0; col < width; col++) {
          const cell = board[row][col];
          if (!cell.revealed && !cell.flagged) {
            let hasRevealedNeighbor = false;
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nr = row + dr;
                const nc = col + dc;
                if (nr >= 0 && nr < height && nc >= 0 && nc < width && board[nr][nc].revealed) {
                  hasRevealedNeighbor = true;
                  break;
                }
              }
              if (hasRevealedNeighbor) break;
            }
            if (hasRevealedNeighbor) candidates.push([row, col]);
          }
        }
      }

      if (candidates.length > 0) {
        const [row, col] = candidates[Math.floor(Math.random() * candidates.length)];
        console.log(`No deterministic moves, revealing random cell at row ${row}, col ${col}`);
        await clickCell(page, row, col, false);
        const newState = await getBoardState();
        await printBoardState(newState.board, newState.width, newState.height);
        if (newState.gameOver) {
          console.log('Game over: Mine hit after random reveal.');
          return false;
        }
        actionTaken = true;
      } else {
        console.log('No safe random moves available.');
      }
    }

    console.log(`Solve step complete. Action taken: ${actionTaken}`);
    return actionTaken;
  }

  // Start game by clicking the center cell
  console.log('Starting game by clicking center cell...');
  const { width, height }: BoardState = await getBoardState();
  const centerRow: number = Math.floor(height / 2);
  const centerCol: number = Math.floor(width / 2);
  await clickCell(page, centerRow, centerCol, false);

  // Check initial click for game over
  const { board: initialBoard, width: initialWidth, height: initialHeight, gameOver: initialGameOver } = await getBoardState();
  await printBoardState(initialBoard, initialWidth, initialHeight);
  if (initialGameOver) {
    console.log('Game over: Mine hit on initial click.');
    const gameStatus: string = await page.evaluate((): string => {
      const smiley = document.querySelector('#smiley');
      const game = document.querySelector('#game');
      const lossCondition = smiley && (smiley.classList.contains('hd_lose') || smiley.classList.contains('hdd_lose')) ||
                            game && game.classList.contains('gameover');
      return lossCondition ? 'lost' : 
             smiley && smiley.classList.contains('hd_win') ? 'won' : 'ongoing';
    });
    console.log(`Game status: ${gameStatus}`);
    return;
  }

  // Main solving loop
  let maxIterations: number = 100;
  while (maxIterations--) {
    const actionTaken: boolean = await solveStep();
    if (!actionTaken) {
      console.log('No more moves, stopping.');
      break;
    }
    await delay(1000);
  }

  // Check final game status
  const gameStatus: string = await page.evaluate((): string => {
    const smiley = document.querySelector('#smiley');
    const game = document.querySelector('#game');
    const lossCondition = smiley && (smiley.classList.contains('hd_lose') || smiley.classList.contains('hdd_lose')) ||
                          game && game.classList.contains('gameover');
    return lossCondition ? 'lost' : 
           smiley && smiley.classList.contains('hd_win') ? 'won' : 'ongoing';
  });

  console.log(`Game status: ${gameStatus}`);

  // Keep browser open for inspection
  // await browser.close();
})();