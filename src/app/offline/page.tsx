// S18 (G-23): ruta de respaldo. El SW sirve /offline.html (estático, bilingüe, sin JS de Next); esta ruta solo
// redirige allí para quien la abra directamente.
import { redirect } from 'next/navigation'

export default function OfflinePage() {
  redirect('/offline.html')
}
