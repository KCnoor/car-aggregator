import TeaserPage from '@/app/components/TeaserPage'

export const metadata = { title: 'نبض السوق — سيارة AI' }

export default function PulsePage () {
  return (
    <TeaserPage
      mode={{
        modeKey: 'pulse',
        emoji: '📡',
        characterAr: 'نبض السوق',
        characterEn: 'Market Pulse',
        titleAr: 'الأخبار، الاتجاهات، والإيقاع',
        titleEn: 'News, trends, and the market rhythm',
        taglineAr: 'السوق يتحرك كل يوم. هذا المكان يقول لك كيف ولماذا.',
        taglineEn: 'The market moves every day. This is where you find out how and why.',
        descriptionAr: 'تابع تحركات الأسعار اليومية، الإطلاقات الجديدة، اتجاهات المخزون لكل ماركة، وأخبار السوق السعودي. لوحة تحكم بسيطة تخبرك ما المهم اليوم وما يستحق المتابعة على المدى الطويل.',
        descriptionEn: 'Daily price movements, new launches, per-brand inventory trends, and Saudi market news. A simple dashboard that tells you what matters today and what is worth watching long-term.',
        accent: '#4A8A8A',
        bg: 'linear-gradient(135deg, rgba(74,138,138,0.14) 0%, rgba(74,138,138,0.04) 100%)',
        preview: 'pulse',
      }}
    />
  )
}
