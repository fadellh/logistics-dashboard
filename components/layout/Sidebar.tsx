"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/ask", label: "Ask AI" },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <nav className="flex w-48 flex-col gap-1 bg-[var(--color-sidebar)] p-4">
      <div className="mb-4 text-sm font-semibold text-white">Spaceship Analytics</div>
      {NAV.map((item) => {
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-[var(--radius-md)] px-3 py-2 text-sm transition ${
              active
                ? "bg-[var(--color-accent)] font-medium text-black"
                : "text-white/60 hover:bg-white/5 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
