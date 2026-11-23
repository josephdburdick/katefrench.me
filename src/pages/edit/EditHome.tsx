import EditShell, {
  cardLinkClass,
  linkClass,
} from "@/components/edit/EditShell"
import { useEditContent } from "@/components/edit/useEdit"
import { EDIT_SECTIONS } from "@/lib/edit-content"
import { Link, useParams } from "react-router"

export default function EditHome() {
  const { token = "" } = useParams()
  const { state, retry } = useEditContent(token)

  return (
    <EditShell
      token={token}
      title="Edit your site"
      home
      state={state}
      retry={retry}
    >
      {(data) => (
        <>
          <p>
            Pick a section to change. Your changes show on the site as soon as
            you save. Keep this link private: anyone who has it can edit.
          </p>
          <ul className="flex flex-col gap-3">
            {EDIT_SECTIONS.filter(({ key }) => data[key]).map(
              ({ key, title }) => (
                <li key={key}>
                  <Link
                    to={
                      key === "numbers"
                        ? `/edit/${token}/numbers`
                        : `/edit/${token}/sections/${key}`
                    }
                    className={cardLinkClass}
                  >
                    <span>{title}</span>
                    {data[key]?.draft && (
                      <span className="bg-primary text-primary-foreground shrink-0 rounded-full px-2.5 py-0.5 text-sm">
                        Draft
                      </span>
                    )}
                  </Link>
                </li>
              ),
            )}
          </ul>
          <Link to={`/edit/${token}/resume`} className={cardLinkClass}>
            Resume
          </Link>
          <Link to={`/edit/${token}/leads`} className={cardLinkClass}>
            Leads
          </Link>
          <a href="/" className={`${linkClass} self-start`}>
            View the site
          </a>
        </>
      )}
    </EditShell>
  )
}
