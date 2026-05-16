import TeaserPage from '@/app/components/TeaserPage'

export const metadata = { title: 'الصياد — سيارة AI' }

export default function HunterPage () {
  return (
    <TeaserPage
      mode={{
        modeKey: 'hunter',
        emoji: '🎯',
        characterAr: 'الصياد',
        titleAr: 'تعرف وش تبي — بس تدور اللقطة',
        taglineAr: 'حدد السيارة، المدينة، والميزانية، وأنا أرصد لك أحسن صفقة لحظة ما تنزل في السوق.',
        descriptionAr: 'الصياد يرصد إعلانات السيارات لحظة بلحظة. حدد المعايير، اضبط التنبيهات، واستلم إشعار فوري لما تنزل صفقة تطابق طلبك — قبل ما تختفي من السوق.',
        accent: '#10B981',
        bg: 'linear-gradient(135deg, rgba(16,185,129,0.14) 0%, rgba(16,185,129,0.04) 100%)',
        preview: 'analyzer',
      }}
    />
  )
}
