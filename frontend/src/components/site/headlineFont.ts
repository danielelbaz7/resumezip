import { Instrument_Serif } from "next/font/google"

// The face of the big headlines on the first screen of the home page and the
// review page. Declared once here, so both pages share one font file; it's the
// first thing either page shows, so it's preloaded.
export const headlineFont = Instrument_Serif({ weight: "400", subsets: ["latin"], variable: "--font-instrument-serif" })
