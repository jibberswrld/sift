"use client";

import { Toaster } from "sonner";
import { Gate } from "@/components/app/gate";
import { InboxProvider } from "@/components/app/inbox";
import { Shell } from "@/components/app/shell";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Gate>
        <InboxProvider>
          <Shell>{children}</Shell>
        </InboxProvider>
      </Gate>
      <Toaster
        position="bottom-center"
        toastOptions={{
          classNames: {
            toast: "!rounded-lg !border !border-line !bg-surface !text-ink !shadow-float !font-sans",
            description: "!text-muted",
            actionButton: "!bg-accent !text-accent-ink !rounded-md",
          },
        }}
      />
    </>
  );
}
