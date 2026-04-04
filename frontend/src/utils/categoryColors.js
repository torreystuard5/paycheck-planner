export const CATEGORY_COLORS = {
  utilities: 'bg-blue-100 text-blue-700',
  subscriptions: 'bg-purple-100 text-purple-700',
  debt: 'bg-red-100 text-red-700',
  housing: 'bg-green-100 text-green-700',
  insurance: 'bg-orange-100 text-orange-700',
  food: 'bg-yellow-100 text-yellow-700',
  transportation: 'bg-teal-100 text-teal-700',
  healthcare: 'bg-pink-100 text-pink-700',
  other: 'bg-gray-100 text-gray-700',
  default: 'bg-gray-100 text-gray-700',
};

export function getCategoryColor(category) {
  if (!category) return CATEGORY_COLORS.default;
  const key = category.toLowerCase().trim();
  return CATEGORY_COLORS[key] || CATEGORY_COLORS.default;
}
