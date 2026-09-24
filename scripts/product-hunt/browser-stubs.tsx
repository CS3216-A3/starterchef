// Framework/analytics adapters for the isolated screenshot harness only.
import type { AnchorHTMLAttributes, ImgHTMLAttributes } from "react";
export const useRouter = () => ({ push() {}, refresh() {}, replace() {} });
export const usePathname = () => "/";
export function trackEvent() {}
export async function toggleSavedRecipe() {
  throw new Error("Server actions are unavailable in the capture harness");
}
export function Link(props: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} />;
}
export function Image({
  fill,
  priority,
  ...props
}: ImgHTMLAttributes<HTMLImageElement> & {
  fill?: boolean;
  priority?: boolean;
}) {
  void fill;
  void priority;
  // Capture harness deliberately uses the source asset without Next's optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return <img {...props} alt={props.alt ?? ""} />;
}
