"use client";

import { ToastContainer, toast as toastify, Slide } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";

export function ToastProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <ToastContainer
        position="top-center"
        autoClose={3000}
        hideProgressBar={false}
        newestOnTop
        closeOnClick
        rtl={false}
        pauseOnFocusLoss={false}
        draggable
        pauseOnHover
        theme="colored"
        transition={Slide}
        toastClassName="!rounded-xl !text-sm !font-medium !shadow-lg"
        style={{ zIndex: 9999 }}
      />
    </>
  );
}

export function useToast() {
  return {
    toast: (message: string, type: "success" | "error" = "success") => {
      if (type === "success") {
        toastify.success(message);
      } else {
        toastify.error(message);
      }
    },
  };
}
