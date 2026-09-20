export function SignalFallback() {
  return <svg className="signal-fallback" viewBox="0 0 200 480" aria-hidden="true">
    <circle className="signal-fallback-orb" cx="100" cy="240" r="75" fill="#7fa996"/>
    <path fill="#afbeb0" d="M129 5C170 99 21 111 59 236S174 339 76 475C200 365 108 263 117 210S182 92 129 5Z"/>
    <path fill="#dce3d5" d="M129 5C85 104 8 162 59 236C38 141 145 105 129 5ZM59 236C158 281 183 371 76 475C137 367 103 308 59 236Z"/>
    <path fill="none" stroke="#e4ebe0" strokeWidth="2" d="M129 8C141 110 39 140 61 235M129 8C154 119 66 153 61 235M61 238C150 302 152 378 78 471M61 238C129 320 125 388 78 471"/>
    <path fill="none" stroke="#668779" strokeOpacity=".4" d="M129 8C169 112 90 179 61 235M61 238C174 307 167 381 78 471"/>
  </svg>;
}
