import polarBear from "../assets/ofs-polar-bear.jpg";

type OfsLogoProps = {
  className?: string;
};

/** Custom OFS lockup: minimal polar bear mark + wordmark. */
export function OfsLogo({ className = "h-8 w-auto" }: OfsLogoProps) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <img
        src={polarBear}
        alt=""
        aria-hidden="true"
        className="h-full w-auto shrink-0 aspect-square rounded-[28%] object-cover shadow-sm ring-1 ring-black/5"
      />
      <span className="text-[1.35rem] font-extrabold tracking-tight text-ink sm:text-[1.45rem]">OFS</span>
    </span>
  );
}
