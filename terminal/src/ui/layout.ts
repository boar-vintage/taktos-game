import blessed from 'blessed';

export function createLayout() {
  const screen = blessed.screen({
    smartCSR: true,
    fullUnicode: false,
    title: 'Taktos Terminal'
  });

  const header = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: 3,
    tags: true,
    border: { type: 'line' },
    style: { border: { fg: 'cyan' } },
    content: ' Taktos Core '
  });

  const log = blessed.log({
    parent: screen,
    top: 3,
    left: 0,
    width: '70%',
    height: '80%-3',
    border: { type: 'line' },
    style: { border: { fg: 'white' } },
    tags: true,
    scrollback: 200
  });

  const side = blessed.box({
    parent: screen,
    top: 3,
    left: '70%',
    width: '30%',
    height: '80%-3',
    border: { type: 'line' },
    style: { border: { fg: 'yellow' } },
    tags: true,
    content: '{bold}Status{/bold}\n'
  });

  const input = blessed.textbox({
    parent: screen,
    bottom: 0,
    left: 0,
    width: '100%',
    height: '20%',
    border: { type: 'line' },
    style: { border: { fg: 'green' } },
    inputOnFocus: true,
    keys: true,
    mouse: true,
    vi: false,
    label: ' Command '
  });

  screen.key(['C-c'], () => process.exit(0));

  return { screen, header, log, side, input };
}
