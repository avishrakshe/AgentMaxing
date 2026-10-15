import Link from "next/link";
import { cn } from "@/lib/utils";

export function Label({ children }: { children: React.ReactNode }) {
  return <p className="flex items-center font-mono text-xs font-medium tracking-[0.06em] text-muted-foreground uppercase">{children}</p>;
}

export function SectionTitle({ num, title }: { num: string; title: string }) {
  return (
    <p className="font-mono text-xs font-medium tracking-[0.06em] uppercase">
      <span className="text-primary">{num}</span>
      <span className="ml-3 text-muted-foreground">{title}</span>
    </p>
  );
}

export function Code({ children }: { children: React.ReactNode }) {
  return <code className="bg-muted px-1 py-0.5 font-mono text-[0.85em] text-foreground">{children}</code>;
}

export function Nav({ active }: { active: "chat" | "dashboard" }) {
  const item = (href: string, label: string, on: boolean) => (
    <Link href={href} className={cn("border px-3 py-1.5 font-mono text-xs tracking-[0.06em] uppercase", on ? "border-primary bg-primary text-primary-foreground" : "hover:border-primary hover:text-primary")}>
      {label}
    </Link>
  );
  return (
    <nav className="flex gap-2">
      {item("/", "Chat", active === "chat")}
      {item("/dashboard", "Dashboard", active === "dashboard")}
    </nav>
  );
}
