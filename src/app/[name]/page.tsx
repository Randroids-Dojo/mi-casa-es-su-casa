import { CharacterView } from '@/components/CharacterView'

interface Props {
  params: Promise<{ name: string }>
}

export default async function CharacterPage({ params }: Props) {
  const { name } = await params
  return <CharacterView name={name} />
}
