import * as React from "react";
import { cn } from "@/lib/utils";

interface IconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

/**
 * Custom "Open Shipping Container" icon — shipping container with doors swung open.
 * Matches lucide-react style: 24×24 viewBox, stroke-based, currentColor.
 */
export function ContainerOpen({ className, ...props }: IconProps) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("lucide", className)}
      {...props}
    >
      {/* Container body */}
      <rect x="1" y="8" width="14" height="10" rx="1" />
      {/* Vertical corrugation ribs on body */}
      <line x1="5.5" y1="8" x2="5.5" y2="18" />
      <line x1="10" y1="8" x2="10" y2="18" />
      {/* Open door — right panel swung outward (foreshortened parallelogram) */}
      <path d="M15 8 L22 10.5 L22 18 L15 18" />
      {/* Door center rib */}
      <line x1="18.5" y1="10.8" x2="18.5" y2="18" />
      {/* Chassis legs */}
      <line x1="3" y1="18" x2="3" y2="21" />
      <line x1="12" y1="18" x2="12" y2="21" />
    </svg>
  );
}
