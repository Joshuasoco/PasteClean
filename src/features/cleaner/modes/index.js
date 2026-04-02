import { codeMode } from './code'
import { emailMode } from './email'
import { markdownMode } from './markdown'
import { plainMode } from './plain'

const MODE_DEFINITIONS = [
  {
    id: 'plain',
    label: 'Plain text',
    description: 'Strips formatting markers and leaves readable text only.',
    rules: [
      'Formatting markers are removed.',
      'Paragraph spacing is kept readable.',
      'Phase 1 and 2 cleanup still runs on the text.',
    ],
    sample: `# Weekly Update

- "Quarterly plan" &amp; weird&nbsp;spacing.
- Visit [campaign page](https://shop.example.com/New%20Drop?utm_campaign=spring-launch&utm_content=hero-banner&color=blue)
> Pulled from notes with extra formatting.
`,
  },
  {
    id: 'markdown',
    label: 'Markdown',
    description: 'Preserves headings, lists, and spacing while cleaning paste damage.',
    rules: [
      'Headings and lists stay in Markdown form.',
      'Spacing is normalized without flattening the document.',
      'Links still get Phase 2 URL cleanup.',
    ],
    sample: `##Launch Notes

* Review the docs link:
  https://www.google.com/url?q=https%3A%2F%2Fexample.com%2Fdocs%2FQuarterly%2520Plan%3Futm_source%3Dnewsletter%26keep%3D1&sa=D

+ Confirm rollout checklist
+ Share update with the team
`,
  },
  {
    id: 'code',
    label: 'Code',
    description: 'Preserves indentation and removes copied line numbers.',
    rules: [
      'Common line-number prefixes are removed.',
      'Indentation is preserved for usable code.',
      'Trailing whitespace and pasted URL junk are still cleaned.',
    ],
    sample: `1 | function greet(name) {
2 |   const docs = "https://example.com/api%20guide?utm_source=docs";
3 |   console.log("Hello, " + name);
4 | }
`,
  },
  {
    id: 'email',
    label: 'Email',
    description: 'Keeps the latest message and removes quoted reply chains.',
    rules: [
      'Quoted email replies are removed.',
      'Reply-header blocks are cut away when detected.',
      'Remaining text is cleaned and URLs are simplified.',
    ],
    sample: `Hi team,

Please review the updated brief:
https://shop.example.com/New%20Drop?utm_campaign=spring-launch&color=blue

Thanks,
Alex

On Tue, Apr 1, 2026 at 9:14 AM Morgan wrote:
> Previous thread content
> Older quoted reply
`,
  },
]

const MODE_MAP = new Map(MODE_DEFINITIONS.map((mode) => [mode.id, mode]))

export function getModes() {
  return MODE_DEFINITIONS
}

export function getModeDefinition(modeId) {
  return MODE_MAP.get(modeId) ?? MODE_MAP.get('plain')
}

export function applyFormatMode(text, modeId, options) {
  switch (modeId) {
    case 'markdown':
      return markdownMode(text, options)
    case 'code':
      return codeMode(text, options)
    case 'email':
      return emailMode(text, options)
    case 'plain':
    default:
      return plainMode(text, options)
  }
}
