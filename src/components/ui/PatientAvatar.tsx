/**
 * Circular patient avatar component that renders a user's Google profile photo
 * when available and gracefully falls back to clean serif monogram initials.
 */

import React, { useEffect, useState } from 'react';
import { User } from 'lucide-react';

export interface PatientAvatarProps {
  src?: string | null;
  name?: string | null;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<PatientAvatarProps['size']>, string> = {
  xs: 'h-5 w-5 text-[10px]',
  sm: 'h-7 w-7 text-[11px]',
  md: 'h-11 w-11 text-sm',
  lg: 'h-16 w-16 text-xl',
};

/**
 * Derive up to two uppercase monogram initials from a patient display name.
 * Inputs: nullable name string.
 * Output: 1-2 character uppercase monogram string or empty string.
 */
function getInitials(name?: string | null): string {
  if (!name) return '';
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

/**
 * Editorial circular avatar for Google PFP or initials fallback.
 */
export const PatientAvatar: React.FC<PatientAvatarProps> = ({
  src,
  name,
  size = 'sm',
  className = '',
}) => {
  const [imgFailed, setImgFailed] = useState(false);

  useEffect(() => {
    setImgFailed(false);
  }, [src]);

  const sizeClass = SIZE_CLASSES[size];
  const initials = getInitials(name);
  const showImage = Boolean(src && src.trim() && !imgFailed);

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-[#B68D5E]/55 bg-[#EFE9E0] font-serif font-semibold text-[#1F1B18] ${sizeClass} ${className}`.trim()}
    >
      {showImage ? (
        <img
          src={src ?? undefined}
          alt={name ? `${name} profile photo` : 'Patient profile photo'}
          referrerPolicy="no-referrer"
          onError={() => setImgFailed(true)}
          className="h-full w-full object-cover"
        />
      ) : initials ? (
        <span aria-hidden="true">{initials}</span>
      ) : (
        <User className="h-3.5 w-3.5 text-[#B68D5E]" aria-hidden="true" />
      )}
    </span>
  );
};

export default PatientAvatar;
