import { ShieldX, Tag, UserCheck } from 'lucide-react';
import { ORG_ISSUE_TEXT } from '../../lib/alerts';

/**
 * OrgComplianceCard: Details organizational model compliance checks, broken rules, and Neo4j relations.
 */
export default function OrgComplianceCard({
  alert,
  violations = [],
  culpritActor,
  culpritActivity,
}) {
  // Aggregate all unique organizational issues across violations
  const orgIssues = Array.from(
    new Set(
      violations.flatMap((v) => v.orgIssues || [])
    )
  );

  const rawAttrs = alert.raw_event?.event_attrs || {};
  const productType = rawAttrs.product_type && rawAttrs.product_type !== 'nan' ? rawAttrs.product_type : null;

  return (
    <section className="drilldown-card" aria-label="Organizational Conformance">
      <div className="drilldown-card__header">
        <h2 className="drilldown-card__title">Organizational Conformance</h2>
      </div>

      <div className="drilldown-card__body">
        {/* Resource Evaluation Profile */}
        <div className={`org-profile-box ${productType ? 'org-profile-box--grid' : ''}`}>
          <div className="org-profile-item">
            <div className="org-profile-avatar">
              <UserCheck size={14} aria-hidden="true" />
            </div>
            <div className="org-profile-info">
              <span className="org-profile-label">Assigned Resource</span>
              <strong className="org-profile-name" title={culpritActor}>{culpritActor}</strong>
            </div>
          </div>

          {productType && (
            <div className="org-profile-item">
              <div className="org-profile-avatar org-profile-avatar--context">
                <Tag size={13} aria-hidden="true" />
              </div>
              <div className="org-profile-info">
                <span className="org-profile-label">Context Category</span>
                <strong className="org-profile-name" title={productType}>{productType}</strong>
              </div>
            </div>
          )}
        </div>

        {/* Broken Organizational Rules */}
        <div className="org-rules-list">
          {orgIssues.length > 0 ? (
            orgIssues.map((issue) => {
              const label =
                issue === 'wrong_structure'
                  ? 'Unauthorized Role / Job Title'
                  : issue === 'wrong_team'
                  ? 'Department / Team Mismatch'
                  : issue;
              const description = ORG_ISSUE_TEXT[issue] || 'Organizational constraint not satisfied.';

              return (
                <div key={issue} className="org-rule-item">
                  <div className="org-rule-badge">
                    <ShieldX size={12} aria-hidden="true" />
                    <span>{label}</span>
                  </div>
                  <p className="org-rule-desc">{description}</p>
                </div>
              );
            })
          ) : (
            <div className="org-rule-item">
              <p className="org-rule-desc">
                Activity &ldquo;{culpritActivity}&rdquo; executed outside permitted organizational boundaries.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
