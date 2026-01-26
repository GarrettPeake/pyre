import { useState } from "react";
import { getTemplateCategories, type BlockTemplate } from "../blockTemplates";
import "./BlockLibrary.css";

interface BlockLibraryProps {
  onSelectTemplate: (template: BlockTemplate) => void;
  onClose: () => void;
}

function BlockLibrary({ onSelectTemplate, onClose }: BlockLibraryProps) {
  const [selectedCategory, setSelectedCategory] = useState<
    BlockTemplate["category"] | null
  >(null);
  const categories = getTemplateCategories();

  const handleTemplateSelect = (template: BlockTemplate) => {
    onSelectTemplate(template);
    onClose();
  };

  const handleBack = () => {
    setSelectedCategory(null);
  };

  return (
    <div className="block-library-overlay" onClick={onClose}>
      <div className="block-library-modal" onClick={(e) => e.stopPropagation()}>
        <div className="block-library-header">
          {selectedCategory ? (
            <>
              <button className="block-library-back" onClick={handleBack}>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M15 18l-6-6 6-6"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
                Back
              </button>
              <h2 className="block-library-title">
                {categories.find((c) => c.category === selectedCategory)?.label}
              </h2>
            </>
          ) : (
            <h2 className="block-library-title">Add from Library</h2>
          )}
          <button className="block-library-close" onClick={onClose}>
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M18 6L6 18M6 6l12 12"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>

        <div className="block-library-content">
          {selectedCategory === null ? (
            // Show categories
            <div className="block-library-categories">
              {categories.map((cat) => (
                <button
                  key={cat.category}
                  className={`block-library-category block-library-category-${cat.category}`}
                  onClick={() => setSelectedCategory(cat.category)}
                >
                  <span className="category-icon">
                    {cat.category === "income" && (
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                    {cat.category === "investments" && (
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M23 6l-9.5 9.5-5-5L1 18"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M17 6h6v6"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                    {cat.category === "loans" && (
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                        <rect
                          x="2"
                          y="4"
                          width="20"
                          height="16"
                          rx="2"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                        <path
                          d="M2 10h20"
                          stroke="currentColor"
                          strokeWidth="2"
                        />
                      </svg>
                    )}
                    {cat.category === "expenses" && (
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
                        <path
                          d="M3 3v18h18"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                        <path
                          d="M18 9l-5 5-4-4-3 3"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    )}
                  </span>
                  <span className="category-label">{cat.label}</span>
                  <span className="category-count">
                    {cat.templates.length} templates
                  </span>
                </button>
              ))}
            </div>
          ) : (
            // Show templates for selected category
            <div className="block-library-templates">
              {categories
                .find((c) => c.category === selectedCategory)
                ?.templates.map((template) => (
                  <button
                    key={template.id}
                    className="block-library-template"
                    onClick={() => handleTemplateSelect(template)}
                  >
                    <div className="template-header">
                      <h3 className="template-name">{template.name}</h3>
                    </div>
                    <p className="template-description">
                      {template.description}
                    </p>
                    <div className="template-inputs">
                      <span className="template-inputs-label">Inputs:</span>
                      {Object.keys(template.state.inputs).map((input) => (
                        <span key={input} className="template-input-tag">
                          {input}
                        </span>
                      ))}
                    </div>
                  </button>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default BlockLibrary;
