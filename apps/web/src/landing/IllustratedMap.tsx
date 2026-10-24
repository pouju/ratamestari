// A drawn stand-in for the sample map until a rendering of it can be shipped with the page.
export function IllustratedMap() {
  return (
    <g aria-hidden="true">
      <rect width="600" height="848" fill="#ffffff" />
      <path d="M0 560 C80 540 140 600 170 660 C190 710 140 780 0 790Z" fill="#ffc94d" />
      <path
        d="M330 690 C380 655 470 665 520 690 C565 715 565 760 520 770 L340 770 C300 750 300 715 330 690Z"
        fill="#ffc94d"
      />
      <path
        d="M380 60 C450 40 540 70 560 130 C575 180 520 200 470 180 C420 165 360 120 380 60Z"
        fill="#ffe3a3"
      />
      <path
        d="M40 300 C90 280 130 320 120 370 C110 410 60 420 35 390 C15 360 10 315 40 300Z"
        fill="#c9ebb5"
      />
      <path
        d="M300 380 C340 360 390 380 395 420 C400 455 350 470 320 455 C290 440 270 400 300 380Z"
        fill="#a9de8f"
      />
      <path
        d="M440 400 C480 380 560 390 575 440 C590 490 540 520 490 505 C450 495 420 440 440 400Z"
        fill="#8fd3f0"
        stroke="#1e9ad6"
        strokeWidth="2"
      />
      <g fill="none" stroke="#c8661e" strokeWidth="1.4">
        <path d="M100 240 C100 170 170 140 230 160 C290 180 290 260 250 300 C210 340 100 320 100 240Z" />
        <path d="M130 240 C130 195 175 175 215 188 C255 202 255 255 228 278 C200 300 130 290 130 240Z" />
        <path d="M160 238 C160 215 185 205 205 212 C225 220 225 248 210 258 C192 270 160 262 160 238Z" />
        <path d="M330 260 C320 200 380 170 440 185 C500 200 510 270 470 310 C430 345 340 330 330 260Z" />
        <path d="M365 258 C360 222 395 205 430 215 C465 226 468 268 445 288 C420 308 370 298 365 258Z" />
        <path d="M170 520 C170 470 230 450 280 470 C330 490 320 560 280 580 C240 600 170 580 170 520Z" />
        <path d="M205 520 C205 495 235 485 260 495 C285 505 282 540 262 550 C240 562 205 550 205 520Z" />
        <path d="M0 120 C80 95 160 80 260 92 C360 104 420 112 600 92" />
        <path d="M0 440 C60 430 120 440 160 470" />
        <path d="M600 610 C520 600 460 615 420 585 C380 555 360 525 330 512" />
      </g>
      <g fill="none" stroke="#1b1b1b" strokeWidth="1.6" strokeDasharray="7 4">
        <path d="M0 470 C100 455 200 430 300 470 C380 500 420 560 470 640 C500 690 540 720 600 730" />
        <path d="M320 0 C310 80 330 140 300 200 C280 240 290 320 310 380" />
      </g>
      <path d="M0 790 C150 782 300 800 600 792" fill="none" stroke="#1b1b1b" strokeWidth="6" />
      <path d="M0 790 C150 782 300 800 600 792" fill="none" stroke="#f2b36b" strokeWidth="3" />
      <rect x="430" y="740" width="24" height="15" fill="#1b1b1b" />
      <g stroke="#1e9ad6" strokeWidth="1.3" opacity="0.7">
        {[60, 180, 300, 420, 540].map(x => (
          <line key={x} x1={x} y1="0" x2={x} y2="848" />
        ))}
      </g>
    </g>
  )
}
