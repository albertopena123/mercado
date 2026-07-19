"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Toaster, toast as sonner } from "sonner";

type ToastType = "success" | "error" | "info";

type ToastApi = {
  show: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
};

function emit(message: string, type: ToastType = "success") {
  if (type === "error") sonner.error(message);
  else if (type === "info") sonner.info(message);
  else sonner.success(message);
}

const api: ToastApi = {
  show: emit,
  success: (m) => emit(m, "success"),
  error: (m) => emit(m, "error"),
  info: (m) => emit(m, "info"),
};

export function ToastProvider({ children }: { children: ReactNode }) {
  // Sincroniza el tema de los toasts con el toggle manual del admin
  // (html[data-theme]) en vez de seguir solo a prefers-color-scheme.
  const [theme, setTheme] = useState<"light" | "dark">("light");
  useEffect(() => {
    const read = () =>
      setTheme(
        document.documentElement.dataset.theme === "dark" ? "dark" : "light",
      );
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => obs.disconnect();
  }, []);

  return (
    <>
      {children}
      <Toaster
        theme={theme}
        richColors
        closeButton
        position="bottom-right"
        toastOptions={{ style: { fontSize: "13.5px" } }}
      />
    </>
  );
}

export function useToast(): ToastApi {
  return api;
}
