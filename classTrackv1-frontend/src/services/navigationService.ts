/**
 * Lets modules outside the React tree (the axios interceptor, in
 * particular) trigger navigation without importing React Router directly.
 * `setNavigate` is called once from a component mounted inside
 * <BrowserRouter> (see App.tsx).
 */
type NavigateFn = (path: string, options?: { replace?: boolean }) => void;

let navigateRef: NavigateFn | null = null;

export function setNavigate(fn: NavigateFn): void {
  navigateRef = fn;
}

export function navigateTo(path: string, options?: { replace?: boolean }): void {
  if (!navigateRef) {
    // Fallback for the rare case a redirect fires before the router mounts
    window.location.assign(path);
    return;
  }
  navigateRef(path, options);
}
