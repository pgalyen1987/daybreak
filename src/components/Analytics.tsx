import Script from "next/script";

// Google Analytics, on the property shared by the Rebel Studios sites (reports split by hostname).
// Production only, so local builds and previews don't count as visitors. Visitors in the EEA, the UK and
// Switzerland default to consent "denied": there GA sends cookieless pings and sets no cookies,
// because this site has no consent banner. Ads storage is never granted. Disclosed in the Rebel
// Studios privacy policy (linked from the footer), which names Daybreak among the measured apps.
// The library loads once the page is idle (lazyOnload): on the mini apps, loading it right after
// hydration cost 15-20 Lighthouse points on phones. The queue above keeps the page view until then.
const GA_ID = "G-00TNDVMQNM";
const CONSENT_REGIONS = ["AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE", "IT", "LV",
  "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE", "IS", "LI", "NO", "GB", "CH"];

export function Analytics() {
  if (process.env.NODE_ENV !== "production") return null;
  const denied = { ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" };
  return (
    <>
      <Script id="ga-consent" strategy="afterInteractive">{`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',${JSON.stringify({ ...denied, analytics_storage: "denied", region: CONSENT_REGIONS })});
gtag('consent','default',${JSON.stringify({ ...denied, analytics_storage: "granted" })});
gtag('js',new Date());gtag('config','${GA_ID}');`}</Script>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="lazyOnload" />
    </>
  );
}
