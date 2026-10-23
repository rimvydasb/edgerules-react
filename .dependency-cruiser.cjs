/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'markdown-file-name',
      comment:
        'Markdown file names must be lowercase, words separated by "-" (e.g. "flow-editor-story.md"). ' +
        'Tool-mandated names (README.md, CLAUDE.md, AGENTS.md, SKILL.md, CHANGELOG.md) are exempt.',
      severity: 'error',
      // Markdown files have no dependencies, so they are always orphans.
      from: {
        orphan: true,
        path: '\\.md$',
        pathNot: ['(^|/)[a-z0-9][a-z0-9-]*\\.md$', '(^|/)(README|CLAUDE|AGENTS|SKILL|CHANGELOG)\\.md$'],
      },
      to: {},
    },
  ],
  options: {
    // Markdown is not JavaScript; scan it so the naming rule sees every .md file.
    extraExtensionsToScan: ['.md'],
    exclude: {
      path: '(^|/)(node_modules|dist|storybook-static|coverage|test-results|playwright-report|\\.git|\\.idea)/',
    },
    // Only markdown naming is checked today; widen this when adding code dependency rules.
    includeOnly: '\\.md$',
    doNotFollow: {path: 'node_modules'},
  },
};
