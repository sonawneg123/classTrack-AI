import { Breadcrumbs as MuiBreadcrumbs, Link, Typography } from "@mui/material";
import { Link as RouterLink } from "react-router-dom";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <MuiBreadcrumbs
      separator={<NavigateNextIcon sx={{ fontSize: 16 }} />}
      sx={{ fontSize: "0.8125rem" }}
    >
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        if (isLast || !item.href) {
          return (
            <Typography
              key={item.label}
              variant="body2"
              color={isLast ? "text.primary" : "text.secondary"}
              fontWeight={isLast ? 600 : 400}
            >
              {item.label}
            </Typography>
          );
        }
        return (
          <Link
            key={item.label}
            component={RouterLink}
            to={item.href}
            underline="hover"
            color="text.secondary"
            variant="body2"
          >
            {item.label}
          </Link>
        );
      })}
    </MuiBreadcrumbs>
  );
}
