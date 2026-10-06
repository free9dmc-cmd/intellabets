import Link from "next/link"

// Shared footer rendered on every in-app page. The legal links must be real and
// reachable: card networks and payment underwriters require terms, privacy, a
// refund policy and contact details to be loadable, and Apple/Google require a
// public privacy policy for store review.
export default function Footer() {
  return (
    <footer className="border-t border-gray-800 py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4">
        <span className="text-xl font-black gradient-text">IntellaBets</span>
        <p className="text-gray-500 text-sm text-center">
          For entertainment purposes. Please gamble responsibly. 18+ only.
        </p>
        <div className="flex flex-wrap gap-4 text-sm text-gray-500 justify-center">
          <Link href="/terms" className="hover:text-gray-300 transition-colors">Terms</Link>
          <Link href="/privacy" className="hover:text-gray-300 transition-colors">Privacy</Link>
          <Link href="/refund" className="hover:text-gray-300 transition-colors">Refund</Link>
          <Link href="/contact" className="hover:text-gray-300 transition-colors">Contact</Link>
          <a
            href="https://www.ncpgambling.org"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-300 transition-colors"
          >
            Responsible Gambling
          </a>
        </div>
      </div>
    </footer>
  )
}
