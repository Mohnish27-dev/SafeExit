"use client";

const variants = {
  ticket: "sf-hero-strip sf-hero-strip--ticket",
  outings: "sf-hero-strip sf-hero-strip--outings",
  emergency: "sf-hero-strip sf-hero-strip--emergency",
  complaint: "sf-hero-strip sf-hero-strip--complaint",
  leave: "sf-hero-strip sf-hero-strip--leave",
};

const iconVariants = {
  emergency: "emergency",
  outings: "outings",
  complaint: "complaint",
  leave: "leave",
};

export default function FeatureHeroStrip({ variant = "ticket", title, description, icon: Icon }) {
  return (
    <div className={`${variants[variant] ?? variants.ticket} sf-rise`}>
      <div className="flex items-start gap-3">
        {Icon && (
          <div className={`sf-header-icon shrink-0 sf-icon-${iconVariants[variant] ?? "ticket"}`}>
            <Icon size={18} />
          </div>
        )}
        <div className="min-w-0">
          <p className="font-sora text-base sm:text-lg font-bold text-slate-800 leading-snug">{title}</p>
          {description && (
            <p className="text-sm text-slate-500 mt-1 leading-relaxed">{description}</p>
          )}
        </div>
      </div>
    </div>
  );
}
