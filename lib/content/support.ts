/**
 * Where people go for help and feedback. The service owner can change these
 * here without touching any page code.
 */
export const SUPPORT = {
  help: {
    /** Campus team that helps people fix PDFs the app can't finish. */
    name: 'UC San Diego Digital Accessibility',
    url: 'https://accessibility.ucsd.edu/'
  },
  feedback: {
    // TODO(service owner): point this at the team that runs this tool (a
    // ServiceNow form, a shared mailbox, etc.). Until then it falls back to the
    // campus accessibility site rather than an unrelated team's inbox.
    url: 'https://accessibility.ucsd.edu/'
  }
} as const;
