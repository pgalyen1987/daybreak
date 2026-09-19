// The fc:miniapp tag (and fc:frame, the older name some clients still read): a cast linking the page
// shows `image` (3:2) with a button that opens `url` as a mini app.
const APP = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export function miniappMeta(image: string, url: string, title = "Open Daybreak") {
  const tag = (type: string) => JSON.stringify({
    version: "1",
    imageUrl: image.startsWith("http") ? image : `${APP}${image}`,
    button: { title, action: { type, name: "Daybreak", url: url.startsWith("http") ? url : `${APP}${url}`, splashImageUrl: `${APP}/splash.png`, splashBackgroundColor: "#0e1422" } },
  });
  return { "fc:miniapp": tag("launch_miniapp"), "fc:frame": tag("launch_frame") };
}
