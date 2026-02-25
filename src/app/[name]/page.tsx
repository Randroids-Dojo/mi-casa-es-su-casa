interface Props {
  params: Promise<{ name: string }>
}

export default async function CharacterPage({ params }: Props) {
  const { name } = await params
  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-2xl">House of {name} — coming soon.</p>
    </main>
  )
}
