import { GameCanvas } from '@/components/GameCanvas'

interface Props {
  params: Promise<{ name: string }>
}

export default async function CharacterPage({ params }: Props) {
  const { name } = await params
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <GameCanvas characterName={name} />
    </div>
  )
}
