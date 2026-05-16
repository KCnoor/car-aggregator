import TeaserPage from '@/app/components/TeaserPage'

export const metadata = { title: 'المحلّل — سيارة AI' }

export default function AnalyzePage () {
  return (
    <TeaserPage
      mode={{
        modeKey: 'analyzer',
        emoji: '🔍',
        characterAr: 'المحلّل',
        titleAr: 'تحليل عميق للسوق',
        taglineAr: 'افهم السعر وراء السعر — مقارنات ذكية، رسوم بيانية، وكشف الصفقات الحقيقية.',
        descriptionAr: 'يعرض المحلّل خرائط فقاعية لكل (ماركة، موديل) بأبعاد السعر مقابل الممشى مع تظليل الصفقات الجيدة. يقارن سيارتك بآخر 50 صفقة مشابهة، يحسب نسبة الانخفاض عن المتوسط، ويوضح إذا كان السعر مبالغاً فيه أو فرصة حقيقية.',
        accent: '#3B82B5',
        bg: 'linear-gradient(135deg, rgba(59,130,181,0.14) 0%, rgba(59,130,181,0.04) 100%)',
        preview: 'analyzer',
      }}
    />
  )
}
