// Idle-game style number formatting for big "lifetime" counters.
//
// Rules:
//   - below 1,000,000            → plain number with commas ("999,999")
//   - millions / billions / trillions → "M" / "B" / "T" ("2.50M")
//   - beyond a trillion          → two-(or more-)letter suffixes that keep
//                                  climbing every ×1000, e.g. 1,000T → "1.00aa",
//                                  1,000aa → "1.00ab", ... "1,000zz" → "1.00aaa"
//
// The letter tiers never run out: numberToLetterSuffix grows a 3rd, 4th, …
// letter once the previous length's 26^n combinations are exhausted, so the
// formatter keeps working no matter how absurd the tonnage gets.

const MILLION = 1_000_000;
const FIXED_SUFFIXES = ['M', 'B', 'T'];
const LETTER_BASE = 26;

// 0-indexed across every letter suffix of length >= 2:
// 0 → 'aa', 25 → 'az', 26 → 'ba', 675 → 'zz', 676 → 'aaa', ...
function numberToLetterSuffix(index) {
  let length = 2;
  let offset = 0;
  while (index - offset >= LETTER_BASE ** length) {
    offset += LETTER_BASE ** length;
    length += 1;
  }

  let remainder = index - offset;
  const letters = [];
  for (let i = 0; i < length; i += 1) {
    letters.unshift(remainder % LETTER_BASE);
    remainder = Math.floor(remainder / LETTER_BASE);
  }
  return letters.map((digit) => String.fromCharCode(97 + digit)).join('');
}

function suffixForTier(tier) {
  if (tier < FIXED_SUFFIXES.length) return FIXED_SUFFIXES[tier];
  return numberToLetterSuffix(tier - FIXED_SUFFIXES.length);
}

// Reduces an absolute value >= 1,000,000 to a { tier, mantissa } pair where
// mantissa always lands in [1, 1000). Values under a million get tier -1 and
// their mantissa is just the value itself (no suffix yet).
function decompose(absValue) {
  if (absValue < MILLION) {
    return { tier: -1, mantissa: absValue };
  }

  let mantissa = absValue / MILLION;
  let tier = 0;
  while (mantissa >= 1000) {
    mantissa /= 1000;
    tier += 1;
  }

  // Rounding to 2 decimals can nudge 999.996 up to a displayed "1000.00" —
  // bump one more tier so the boundary always reads e.g. "1.00T", never
  // "1000.00B".
  if (Math.round(mantissa * 100) / 100 >= 1000) {
    mantissa /= 1000;
    tier += 1;
  }

  return { tier, mantissa };
}

export function formatIdleNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';

  const sign = num < 0 ? '-' : '';
  const { tier, mantissa } = decompose(Math.abs(num));

  if (tier === -1) {
    return sign + Math.round(mantissa).toLocaleString('en-US');
  }

  const formatted = mantissa.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `${sign}${formatted}${suffixForTier(tier)}`;
}

// Progress toward the next suffix milestone (e.g. 45B → the jump to T),
// for driving a progress bar. percent is 0-100.
export function getLifetimeProgress(value) {
  const abs = Math.abs(Number(value) || 0);
  const { tier, mantissa } = decompose(abs);

  if (tier === -1) {
    return {
      currentLabel: null,
      nextLabel: suffixForTier(0),
      percent: Math.min(100, (mantissa / MILLION) * 100),
    };
  }

  return {
    currentLabel: suffixForTier(tier),
    nextLabel: suffixForTier(tier + 1),
    percent: Math.min(100, (mantissa / 1000) * 100),
  };
}
