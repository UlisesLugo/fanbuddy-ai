import { AppSidebar } from "@/components/layout/AppSidebar";

export default function MainAppLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <AppSidebar />
      <div className="flex min-h-0 flex-1 flex-col pb-16 md:pb-0 md:pl-[4.5rem]">
        {children}
      </div>
    </div>
  );
}
