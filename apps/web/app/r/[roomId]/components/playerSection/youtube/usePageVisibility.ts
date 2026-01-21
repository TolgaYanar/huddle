import * as React from "react";

export function usePageVisibility(isClient: boolean) {
  const [isPageVisible, setIsPageVisible] = React.useState(true);

  React.useEffect(() => {
    if (!isClient) return;
    const update = () => {
      setIsPageVisible(
        typeof document === "undefined" ||
          document.visibilityState !== "hidden",
      );
    };
    update();
    document.addEventListener("visibilitychange", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
    };
  }, [isClient]);

  return isPageVisible;
}
