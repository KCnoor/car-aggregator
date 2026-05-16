import TeaserPage from '@/app/components/TeaserPage'

export const metadata = { title: 'نبض السوق — سيارة AI' }

export default function PulsePage () {
  return (
    <TeaserPage
      mode={{
        modeKey: 'pulse',
        emoji: '📡',
        characterAr: 'نبض السوق',
        titleAr: 'الأخبار، الاتجاهات، والإيقاع',
        taglineAr: 'السوق يتحرك كل يوم. هذا المكان يقول لك كيف ولماذا.',
        descriptionAr: 'تابع تحركات الأسعار اليومية، الإطلاقات الجديدة، اتجاهات المخزون لكل ماركة، وأخبار السوق السعودي. لوحة تحكم بسيطة تخبرك ما المهم اليوم وما يستحق المتابعة على المدى الطويل.',
        accent: '#4A8A8A',
        bg: 'linear-gradient(135deg, rgba(74,138,138,0.14) 0%, rgba(74,138,138,0.04) 100%)',
        preview: 'pulse',
      }}
    />
  )
}
