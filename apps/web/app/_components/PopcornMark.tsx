type PopcornMarkProps = {
  size: number;
};

export function PopcornMark({ size }: PopcornMarkProps) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 96 96"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M19 43h58L69 88H27L19 43Z" fill="#c56d24" />
      <path d="m31 43 5 45h11V43H31Zm29 0v45h9l8-45H60Z" fill="#fff3da" />
      <path d="M17 40h62v11H17z" fill="#793b18" />
      <path d="M17 40h62v3H17z" fill="#e7a747" />
      <g fill="#fff3da" stroke="#d1882f" strokeWidth="2">
        <circle cx="29" cy="34" r="11" />
        <circle cx="42" cy="24" r="13" />
        <circle cx="58" cy="27" r="13" />
        <circle cx="69" cy="36" r="10" />
        <circle cx="48" cy="38" r="12" />
      </g>
      <circle cx="42" cy="20" r="3" fill="#fffaf0" />
    </svg>
  );
}
