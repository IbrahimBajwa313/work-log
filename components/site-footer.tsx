import { Mail, Phone, Globe } from "lucide-react";

const services = [
  "AI Development",
  "Web & Custom Software",
  "AI Chatbot Integration",
  "ChatGPT Integrations",
  "Machine & Deep Learning",
  "Natural Language Processing",
];

const company = [
  "About Us",
  "Blog & Insights",
  "Contact Us",
  "Internship Program",
  "Free Consultation",
];

const legal = ["Privacy", "Terms", "Cookies", "Sitemap"];

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-[var(--card-border)] bg-[var(--card-bg)]/70 backdrop-blur">
      <div className="mx-auto max-w-6xl px-3 py-8 sm:px-4 sm:py-12">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="lg:pr-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt="Work Logging by TechCognify"
              className="h-11 w-auto"
            />
            <p className="mt-4 text-sm leading-relaxed text-[var(--text-secondary)]">
            We Build SaaS Products Your Competitors Wish They Had
            </p>
          </div>

          {/* Services */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-white">
              Services
            </h3>
            <ul className="mt-4 space-y-2">
              {services.map((item) => (
                <li key={item}>
                  <a
                    href="https://techcognify.com"
                    className="text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--accent-cyan)]"
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Company */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-white">
              Company
            </h3>
            <ul className="mt-4 space-y-2">
              {company.map((item) => (
                <li key={item}>
                  <a
                    href="https://techcognify.com"
                    className="text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--accent-cyan)]"
                  >
                    {item}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wide text-white">
              Contact
            </h3>
            <ul className="mt-4 space-y-3">
              <li className="flex items-start gap-2.5">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-cyan)]" />
                <a
                  href="mailto:contact@techcognify.com"
                  className="text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--accent-cyan)]"
                >
                  contact@techcognify.com
                </a>
              </li>
              <li className="flex items-start gap-2.5">
                <Phone className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-cyan)]" />
                <a
                  href="tel:+923275012457"
                  className="text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--accent-cyan)]"
                >
                  +92 327 5012457
                </a>
              </li>
              <li className="flex items-start gap-2.5">
                <Globe className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-cyan)]" />
                <a
                  href="https://techcognify.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--text-secondary)] transition-colors hover:text-[var(--accent-cyan)]"
                >
                  techcognify.com
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-[var(--card-border)] pt-6 sm:flex-row">
          <p className="text-xs text-[var(--text-secondary)]">
            &copy; {year} TechCognify. All rights reserved.
          </p>
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {legal.map((item) => (
              <li key={item}>
                <a
                  href="https://techcognify.com"
                  className="text-xs text-[var(--text-secondary)] transition-colors hover:text-[var(--accent-cyan)]"
                >
                  {item}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
