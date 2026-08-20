import { OCDataProvider } from "@/hooks/oc-tracker/OCDataContext";
import { OcTrackerChrome } from "@/components/oc-tracker/OcTrackerChrome";

export default function OcTrackerLayout({ children }) {
  return (
    <div data-app="oc-tracker" className="bg-[var(--background)] text-[var(--foreground)] min-h-full">
      <OCDataProvider>
        <OcTrackerChrome>{children}</OcTrackerChrome>
      </OCDataProvider>
    </div>
  );
}
