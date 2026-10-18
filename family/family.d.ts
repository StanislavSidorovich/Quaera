// Types for <quaera-switcher> (switcher.js) when it is used from JSX.
// A separate module file with `import 'react'` on purpose: the same lines in env.d.ts (a global
// script file) would replace React's types instead of extending them.
import 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'quaera-switcher': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & { app: string }
    }
  }
}

declare global {
  interface Window {
    /** Set by switcher.js: reuse the one named window per app; true when the click was handled. */
    quaeraOpenApp?: (anchor: HTMLAnchorElement, event: MouseEvent, id: string) => boolean
  }
}
