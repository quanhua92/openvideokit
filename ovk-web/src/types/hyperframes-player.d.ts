import type { HyperframesPlayer } from "@hyperframes/player";

declare global {
  namespace React {
    namespace JSX {
      interface IntrinsicElements {
        "hyperframes-player": React.DetailedHTMLProps<
          React.HTMLAttributes<HTMLElement> & {
            src?: string;
            srcdoc?: string;
            controls?: boolean;
            muted?: boolean;
            loop?: boolean;
            autoplay?: boolean;
            "playback-rate"?: string | number;
            poster?: string;
            "audio-src"?: string;
            width?: string | number;
            height?: string | number;
            ref?: React.Ref<HyperframesPlayer>;
          },
          HTMLElement
        >;
      }
    }
  }
}
