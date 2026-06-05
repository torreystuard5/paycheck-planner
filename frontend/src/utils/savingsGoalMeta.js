import {
  PiggyBank,
  Target,
  Plane,
  Home,
  Car,
  GraduationCap,
  Heart,
  Gift,
  Briefcase,
  Sparkles,
} from 'lucide-react';

const GOAL_ICONS = [PiggyBank, Target, Plane, Home, Car, GraduationCap, Heart, Gift, Briefcase, Sparkles];
const GOAL_TONES = ['brand', 'accent', 'purple', 'success', 'debt'];

export function getGoalVisual(name = '') {
  const hash = [...name].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return {
    icon: GOAL_ICONS[hash % GOAL_ICONS.length],
    tone: GOAL_TONES[hash % GOAL_TONES.length],
  };
}

export function getGoalProgress(goal) {
  const target = Number(goal.target_amount) || 0;
  const current = Number(goal.current_amount) || 0;
  if (target <= 0) return 0;
  return Math.min((current / target) * 100, 100);
}

export function estimateProjectedDate(goal, contributions = []) {
  const target = Number(goal.target_amount) || 0;
  const current = Number(goal.current_amount) || 0;
  if (target > 0 && current >= target) return { label: 'Goal reached!', complete: true };
  if (goal.target_date) {
    return { label: goal.target_date, complete: false, isTarget: true };
  }

  const goalContribs = contributions.filter((c) => c.goal_id === goal.id);
  if (goalContribs.length < 2 || target <= current) return null;

  const sorted = [...goalContribs]
    .filter((c) => c.pay_period_date)
    .sort((a, b) => new Date(a.pay_period_date) - new Date(b.pay_period_date));
  if (sorted.length < 2) return null;

  const total = sorted.reduce((s, c) => s + (Number(c.amount) || 0), 0);
  const daysSpan = Math.max(
    1,
    (new Date(sorted[sorted.length - 1].pay_period_date) - new Date(sorted[0].pay_period_date))
      / (1000 * 60 * 60 * 24),
  );
  const dailyRate = total / daysSpan;
  if (dailyRate <= 0) return null;

  const remaining = target - current;
  const daysLeft = Math.ceil(remaining / dailyRate);
  const projected = new Date();
  projected.setDate(projected.getDate() + daysLeft);
  return { label: projected.toISOString().split('T')[0], complete: false, projected: true };
}
